package com.universal.webai.controllers;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.universal.webai.models.Website;
import com.universal.webai.repositories.WebsiteRepository;
import com.universal.webai.scraper.Scraper;
import com.universal.webai.services.AiService;
import com.universal.webai.services.WebService;
import com.universal.webai.types.ExtractCompatResult;
import com.universal.webai.types.QueryRequest;
import com.universal.webai.types.QueryResponse;
import com.universal.webai.types.VectorSearchHit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * REST controller for the main AI query/chat endpoint.
 *
 * <p>Equivalent to {@code query.controller.ts} in the Node.js backend.
 * Exposes {@code POST /api/v1/query} and orchestrates:
 * <ol>
 *   <li>URL normalisation and validation</li>
 *   <li>Background full-site mapping (first visit only)</li>
 *   <li>Embedding the user's question</li>
 *   <li>Vector search for relevant page URLs</li>
 *   <li>Fallback web search if vector hits are weak</li>
 *   <li>Parallel page scraping with a 30-second timeout</li>
 *   <li>AI answer synthesis</li>
 *   <li>AI relevant-link selection</li>
 * </ol>
 */
@RestController
@RequestMapping("/api/v1")
public class QueryController {

    private static final Logger log = LoggerFactory.getLogger(QueryController.class);

    /**
     * In-memory set of domains currently being mapped in the background.
     * Prevents duplicate concurrent mapping jobs for the same domain.
     * Equivalent to {@code mappingInProgress} Set in {@code query.controller.ts}.
     */
    private static final Set<String> MAPPING_IN_PROGRESS = ConcurrentHashMap.newKeySet();

    /** Minimum cosine-similarity score for a vector hit to be considered relevant. */
    private static final double VECTOR_SCORE_THRESHOLD = 0.7;

    /** Per-page scrape timeout in milliseconds (matches Node.js 30 s timeout). */
    private static final long SCRAPE_TIMEOUT_MS = 30_000;

    private final AiService aiService;
    private final WebService webService;
    private final WebsiteRepository websiteRepository;
    private final Scraper scraper;
    private final MongoTemplate mongoTemplate;
    private final ObjectMapper objectMapper;

    public QueryController(
            AiService aiService,
            WebService webService,
            WebsiteRepository websiteRepository,
            Scraper scraper,
            MongoTemplate mongoTemplate,
            ObjectMapper objectMapper) {
        this.aiService = aiService;
        this.webService = webService;
        this.websiteRepository = websiteRepository;
        this.scraper = scraper;
        this.mongoTemplate = mongoTemplate;
        this.objectMapper = objectMapper;
    }

    // ── Main route handler ─────────────────────────────────────────────────────

    /**
     * Handles {@code POST /api/v1/query}.
     *
     * <p>Equivalent to {@code handleQuery} in {@code query.controller.ts}.
     *
     * @param request JSON body containing the question and URL context
     * @return JSON response with {@code answer}, {@code sources}, and {@code relevantLinks}
     */
    @PostMapping("/query")
    public ResponseEntity<?> handleQuery(@RequestBody QueryRequest request) {
        long requestStartedAt = System.currentTimeMillis();
        String requestId = Long.toString(System.currentTimeMillis(), 36)
                + "-" + UUID.randomUUID().toString().substring(0, 6);

        try {
            // ── 1. Normalise & validate URLs ─────────────────────────────────

            // Backward-compatible: prefer currentPageUrl, fall back to websiteUrl
            String normalizedCurrentUrl = normalizeUrlInput(request.getCurrentPageUrl());
            if (normalizedCurrentUrl == null) {
                normalizedCurrentUrl = normalizeUrlInput(request.getWebsiteUrl());
            }

            String normalizedBaseUrl = normalizeUrlInput(request.getBaseUrl());
            if (normalizedBaseUrl == null && normalizedCurrentUrl != null) {
                normalizedBaseUrl = toBaseUrl(normalizedCurrentUrl);
            }

            if (normalizedCurrentUrl == null || normalizedBaseUrl == null) {
                log.warn("[QUERY][{}][INVALID_INPUT] questionPresent={} current={} base={}",
                        requestId,
                        request.getQuestion() != null,
                        normalizedCurrentUrl != null,
                        normalizedBaseUrl != null);
                return ResponseEntity.badRequest()
                        .body(Map.of("message",
                                "Invalid URL input. Please provide a valid current/base URL."));
            }

            // Domain always comes from the base URL for consistency across sub-pages
            String domain = new URI(normalizedBaseUrl).getHost();
            log.info("[QUERY][{}][START] domain={} currentUrl={} baseUrl={}",
                    requestId, domain, normalizedCurrentUrl, normalizedBaseUrl);

            // ── 2. Background site mapping (first visit only) ─────────────────

            Optional<Website> siteExists = websiteRepository.findByDomain(domain);
            boolean alreadyMapped = siteExists.map(Website::isMapped).orElse(false);

            if (!alreadyMapped && MAPPING_IN_PROGRESS.add(domain)) {
                // Create a placeholder so other concurrent requests see an in-progress record
                mongoTemplate.upsert(
                        Query.query(Criteria.where("domain").is(domain)),
                        Update.update("domain", domain).set("isMapped", false),
                        Website.class);

                log.info("[QUERY][{}][MAP] domain={} mode=background status=started", requestId, domain);

                final String finalDomain = domain;
                final String finalBaseUrl = normalizedBaseUrl;
                // Fire-and-forget — equivalent to `void mapNewWebsite(...)` in Node.js
                webService.mapNewWebsite(finalDomain, finalBaseUrl);
                CompletableFuture.runAsync(() -> {}) // no-op to attach cleanup
                        .whenComplete((v, err) -> {
                            if (err != null) {
                                log.error("[QUERY][{}][MAP] domain={} mode=background status=failed error={}",
                                        requestId, finalDomain, err.getMessage());
                            }
                        });
            }

            // ── 3. Embed the question ─────────────────────────────────────────

            long embeddingStartedAt = System.currentTimeMillis();
            List<Double> questionVector = aiService.getEmbedding(request.getQuestion());
            log.info("[QUERY][{}][EMBEDDING] durationMs={}", requestId,
                    System.currentTimeMillis() - embeddingStartedAt);

            // ── 4. Vector search for relevant URLs ────────────────────────────

            long vectorStartedAt = System.currentTimeMillis();
            List<VectorSearchHit> candidateLinks = webService.vectorSearch(questionVector, domain);
            log.info("[QUERY][{}][VECTOR] candidates={} durationMs={}", requestId,
                    candidateLinks.size(), System.currentTimeMillis() - vectorStartedAt);

            // Only keep hits above the similarity threshold
            List<String> targetUrls = candidateLinks.stream()
                    .filter(l -> l.getScore() > VECTOR_SCORE_THRESHOLD)
                    .map(VectorSearchHit::getUrl)
                    .collect(Collectors.toList());

            // ── 5. Fallback web search if vector hits are too weak ────────────

            if (targetUrls.isEmpty()) {
                long fallbackStartedAt = System.currentTimeMillis();
                List<String> searchResults = scraper.searchWeb(
                        domain + " " + request.getQuestion(), 2);
                targetUrls = searchResults.isEmpty()
                        ? List.of(normalizedCurrentUrl)
                        : searchResults;
                log.info("[QUERY][{}][FALLBACK] urls={} durationMs={}", requestId,
                        targetUrls.size(), System.currentTimeMillis() - fallbackStartedAt);
            }

            // ── 6. Assemble ordered source list ──────────────────────────────

            // Priority: current page → base URL → vector/search URLs (de-duplicated)
            LinkedHashSet<String> sourcesSet = new LinkedHashSet<>();
            sourcesSet.add(normalizedCurrentUrl);
            sourcesSet.add(normalizedBaseUrl);
            sourcesSet.addAll(targetUrls);
            List<String> sources = new ArrayList<>(sourcesSet);
            log.info("[QUERY][{}][SOURCES] total={}", requestId, sources.size());

            // ── 7. Parallel page scraping with timeout ────────────────────────

            long extractionStartedAt = System.currentTimeMillis();
            String question = request.getQuestion();

            // Build the extraction prompt (same wording as Node.js backend)
            String extractionPrompt = """
                    Question: %s
                    Extract the most precise factual answer from this page.
                    If the question asks for a designation holder (for example director/dean/HOD), return the exact person name tied to that designation.
                    Also include one short supporting line copied from the page where the answer appears.
                    Prefer exact names, numbers, and dates from the page text.
                    Do not add explanation.
                    """.formatted(question);

            // JSON schema for structured extraction
            ObjectNode schema = objectMapper.createObjectNode();
            schema.put("type", "object");
            ObjectNode properties = schema.putObject("properties");
            properties.putObject("answer").put("type", "string");
            properties.putObject("details").put("type", "string");
            properties.putObject("found_in_pdf").put("type", "boolean");
            schema.putArray("required").add("answer");

            // Scrape each source URL in parallel with a 30-second timeout
            List<CompletableFuture<ExtractCompatResult>> futures = sources.stream()
                    .map(url -> CompletableFuture.supplyAsync(() ->
                            scraper.scrapeUrlCompat(url, extractionPrompt, schema))
                            .orTimeout(SCRAPE_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                            .exceptionally(err -> {
                                log.error("[QUERY][{}][EXTRACT][ERROR] url={} error={}",
                                        requestId, url, err.getMessage());
                                return new ExtractCompatResult(false, null);
                            }))
                    .collect(Collectors.toList());

            List<ExtractCompatResult> results = futures.stream()
                    .map(CompletableFuture::join)
                    .filter(ExtractCompatResult::isSuccess)
                    .collect(Collectors.toList());

            log.info("[QUERY][{}][EXTRACT] success={}/{} durationMs={}", requestId,
                    results.size(), sources.size(),
                    System.currentTimeMillis() - extractionStartedAt);

            if (results.isEmpty()) {
                return ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("message", "No info found"));
            }

            // ── 8. Build context string from extraction results ───────────────

            String context = results.stream()
                    .map(r -> {
                        if (r.getExtract() == null) return "";
                        String answer = r.getExtract().getAnswer() != null
                                ? r.getExtract().getAnswer().trim() : "";
                        String details = r.getExtract().getDetails() != null
                                ? r.getExtract().getDetails().trim() : "";
                        return List.of(answer, details).stream()
                                .filter(s -> !s.isBlank())
                                .collect(Collectors.joining("\n"));
                    })
                    .filter(s -> !s.isBlank())
                    .collect(Collectors.joining("\n---\n"));

            // ── 9. AI answer synthesis ────────────────────────────────────────

            long answerStartedAt = System.currentTimeMillis();
            String answer = aiService.synthesizeAnswer(question, context);
            log.info("[QUERY][{}][ANSWER] durationMs={}", requestId,
                    System.currentTimeMillis() - answerStartedAt);

            // ── 10. AI relevant-link selection ────────────────────────────────

            long linksStartedAt = System.currentTimeMillis();
            List<String> relevantLinks = aiService.synthesizeRelevantLinks(question, context, sources);
            log.info("[QUERY][{}][RELEVANT_LINKS] count={} durationMs={}", requestId,
                    relevantLinks.size(), System.currentTimeMillis() - linksStartedAt);

            log.info("[QUERY][{}][DONE] status=200 totalDurationMs={}", requestId,
                    System.currentTimeMillis() - requestStartedAt);

            return ResponseEntity.ok(new QueryResponse(answer, sources, relevantLinks));

        } catch (Exception error) {
            log.error("[QUERY][{}][FAILED] totalDurationMs={} error={}", requestId,
                    System.currentTimeMillis() - requestStartedAt,
                    error.getMessage() != null ? error.getMessage() : error.toString());
            return ResponseEntity.internalServerError()
                    .body(Map.of("error", error.getMessage() != null ? error.getMessage() : "Unknown error"));
        }
    }

    // ── URL helpers ────────────────────────────────────────────────────────────

    /**
     * Normalizes a raw URL string to a usable absolute URL.
     * Prepends {@code https://} when the protocol is missing.
     *
     * <p>Equivalent to {@code normalizeUrlInput()} in {@code query.controller.ts}.
     *
     * @param value raw URL input (may be {@code null} or blank)
     * @return normalized URL string, or {@code null} if the input is invalid
     */
    private String normalizeUrlInput(String value) {
        if (value == null || value.isBlank()) return null;
        String raw = value.strip();
        try {
            return new URI(raw).toURL().toString();
        } catch (Exception ignored) {
            // No protocol — try prepending https://
            try {
                return new URI("https://" + raw).toURL().toString();
            } catch (Exception ignored2) {
                return null;
            }
        }
    }

    /**
     * Returns the base URL (origin + trailing slash) for a given absolute URL.
     *
     * <p>Equivalent to {@code toBaseUrl()} in {@code query.controller.ts}.
     *
     * @param url a valid absolute URL
     * @return base URL string (e.g. {@code "https://example.com/"})
     */
    private String toBaseUrl(String url) {
        try {
            URI uri = new URI(url);
            return uri.getScheme() + "://" + uri.getHost()
                    + (uri.getPort() != -1 ? ":" + uri.getPort() : "") + "/";
        } catch (Exception e) {
            return url;
        }
    }
}
