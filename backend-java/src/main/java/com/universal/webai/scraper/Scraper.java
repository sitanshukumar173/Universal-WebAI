package com.universal.webai.scraper;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.universal.webai.types.ExtractCompatResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Wrapper around the Firecrawl REST API and Google Generative AI REST API.
 *
 * <p>Equivalent to {@code scraper.ts} in the Node.js backend.
 * Provides:
 * <ul>
 *   <li>{@link #scrapeUrlCompat} — scrape a single page with structured JSON extraction</li>
 *   <li>{@link #mapWebsite} — crawl an entire site and return all discovered URLs</li>
 *   <li>{@link #searchWeb} — Firecrawl web search</li>
 *   <li>{@link #getEmbeddingValues} — delegate to Gemini embedding API</li>
 *   <li>{@link #generateContent} — delegate to Gemini content generation API</li>
 * </ul>
 */
@Component
public class Scraper {

    private static final Logger log = LoggerFactory.getLogger(Scraper.class);

    /** Firecrawl REST API base URL. */
    private static final String FIRECRAWL_BASE = "https://api.firecrawl.dev";

    /** Google Generative Language API base URL. */
    private static final String GEMINI_BASE = "https://generativelanguage.googleapis.com";

    /**
     * Pattern matching lines that look like role designations.
     * Used in {@link #pickMarkdownSnippet} to prefer role-bearing lines.
     */
    private static final Pattern ROLE_LINE_PATTERN = Pattern.compile(
            "director|dean|hod|head|chairperson|principal|registrar|vice chancellor|dr\\.|prof\\.",
            Pattern.CASE_INSENSITIVE);

    private final String firecrawlKey;
    private final ObjectMapper objectMapper;

    // Lazily initialized WebClients so the beans are created only when needed
    private volatile WebClient firecrawlClient;
    private volatile WebClient geminiClient;

    public Scraper(
            @Value("${firecrawl.key}") String firecrawlKey,
            ObjectMapper objectMapper) {
        this.firecrawlKey = firecrawlKey;
        this.objectMapper = objectMapper;
    }

    // ── WebClient factories ────────────────────────────────────────────────────

    /**
     * Returns the singleton Firecrawl {@link WebClient}, creating it on first use.
     */
    private WebClient firecrawlClient() {
        if (firecrawlClient == null) {
            synchronized (this) {
                if (firecrawlClient == null) {
                    firecrawlClient = WebClient.builder()
                            .baseUrl(FIRECRAWL_BASE)
                            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + firecrawlKey)
                            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                            .build();
                }
            }
        }
        return firecrawlClient;
    }

    /**
     * Returns the singleton Gemini {@link WebClient}, creating it on first use.
     */
    private WebClient geminiClient() {
        if (geminiClient == null) {
            synchronized (this) {
                if (geminiClient == null) {
                    geminiClient = WebClient.builder()
                            .baseUrl(GEMINI_BASE)
                            .defaultHeader(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                            .build();
                }
            }
        }
        return geminiClient;
    }

    // ── Firecrawl helpers ──────────────────────────────────────────────────────

    /**
     * Scrapes a URL using Firecrawl's structured JSON extraction.
     *
     * <p>Equivalent to {@code scrapeUrlCompat()} in {@code scraper.ts}.
     * Calls {@code POST /v1/scrape} with the {@code extract} format and returns a
     * normalized {@link ExtractCompatResult}.  If structured extraction fails, falls
     * back to the plain markdown content.
     *
     * @param url     the page to scrape
     * @param prompt  the LLM extraction prompt
     * @param schema  JSON schema for the structured extraction (as a Jackson {@link JsonNode})
     * @return extraction result, {@code success=false} if scraping fails entirely
     */
    public ExtractCompatResult scrapeUrlCompat(String url, String prompt, JsonNode schema) {
        try {
            // Build the Firecrawl v1 /scrape request body
            ObjectNode body = objectMapper.createObjectNode();
            body.put("url", url);
            body.put("onlyMainContent", true);

            // Request both structured extraction and markdown as a fallback
            ArrayNode formats = body.putArray("formats");
            formats.add("extract");
            formats.add("markdown");

            // Extraction options
            ObjectNode extractNode = body.putObject("extract");
            extractNode.put("prompt", prompt);
            extractNode.set("schema", schema);

            String responseBody = firecrawlClient()
                    .post()
                    .uri("/v1/scrape")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);

            // Prefer structured extraction (json/extract field)
            JsonNode extractData = root.path("data").path("extract");
            if (!extractData.isMissingNode() && !extractData.isNull()) {
                ExtractCompatResult.Extract extract = new ExtractCompatResult.Extract();
                extract.setAnswer(extractData.path("answer").asText(null));
                extract.setDetails(extractData.path("details").asText(null));
                if (!extractData.path("found_in_pdf").isMissingNode()) {
                    extract.setFoundInPdf(extractData.path("found_in_pdf").asBoolean(false));
                }
                return new ExtractCompatResult(true, extract);
            }

            // Fallback: parse markdown and return the best snippet
            JsonNode markdownNode = root.path("data").path("markdown");
            if (!markdownNode.isMissingNode() && markdownNode.isTextual()) {
                String snippet = pickMarkdownSnippet(markdownNode.asText(""));
                if (!snippet.isBlank()) {
                    ExtractCompatResult.Extract extract = new ExtractCompatResult.Extract();
                    extract.setAnswer(snippet);
                    return new ExtractCompatResult(true, extract);
                }
            }

        } catch (Exception err) {
            log.error("Scrape failed for {}: {}", url, err.getMessage(), err);
        }

        return new ExtractCompatResult(false, null);
    }

    /**
     * Maps (crawls) an entire website and returns all discovered page URLs.
     *
     * <p>Equivalent to {@code firecrawl.map(websiteUrl, { sitemap: "include" })} in
     * {@code web.service.ts}.
     * Calls {@code POST /v1/map} and normalizes the link list to {@code List<String>}.
     *
     * @param websiteUrl root URL of the site to map
     * @return list of all discovered URLs (may be empty on failure)
     */
    public List<String> mapWebsite(String websiteUrl) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("url", websiteUrl);
            // Include sitemap.xml entries in the result
            body.put("sitemapOnly", false);
            body.put("includeSubdomains", false);

            String responseBody = firecrawlClient()
                    .post()
                    .uri("/v1/map")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode links = root.path("links");

            List<String> urls = new ArrayList<>();
            if (links.isArray()) {
                for (JsonNode link : links) {
                    // Links may be plain strings or objects with a "url" field
                    if (link.isTextual()) {
                        urls.add(link.asText());
                    } else if (link.isObject()) {
                        String linkUrl = link.path("url").asText(null);
                        if (linkUrl != null && !linkUrl.isBlank()) {
                            urls.add(linkUrl);
                        }
                    }
                }
            }
            return urls;

        } catch (Exception err) {
            log.error("Map failed for {}: {}", websiteUrl, err.getMessage(), err);
            return List.of();
        }
    }

    /**
     * Searches the web via Firecrawl and returns up to {@code limit} result URLs.
     *
     * <p>Equivalent to {@code firecrawl.search(query, { limit })} in
     * {@code query.controller.ts}.
     * Calls {@code POST /v1/search}.
     *
     * @param query  search query string
     * @param limit  maximum number of results
     * @return list of result URLs (may be empty)
     */
    public List<String> searchWeb(String query, int limit) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("query", query);
            body.put("limit", limit);

            String responseBody = firecrawlClient()
                    .post()
                    .uri("/v1/search")
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);

            // The Firecrawl search response may use "data" or "web" as the results array key
            JsonNode resultsNode = root.has("data") ? root.path("data") : root.path("web");

            List<String> urls = new ArrayList<>();
            if (resultsNode.isArray()) {
                for (JsonNode item : resultsNode) {
                    String url = item.path("url").asText(null);
                    if (url != null && !url.isBlank()) {
                        urls.add(url);
                    }
                }
            }
            return urls;

        } catch (Exception err) {
            log.error("Firecrawl search failed for '{}': {}", query, err.getMessage(), err);
            return List.of();
        }
    }

    // ── Google Generative AI helpers ───────────────────────────────────────────

    /**
     * Generates an embedding vector for the given text using the Gemini embedding model.
     *
     * <p>Equivalent to the {@code getGenAI().getGenerativeModel(...).embedContent(text)} call
     * in {@code ai.service.ts}.
     * Calls {@code POST /v1beta/{model}:embedContent}.
     *
     * @param text       the text to embed
     * @param model      Gemini embedding model name (e.g. {@code models/gemini-embedding-001})
     * @param apiKey     Gemini API key
     * @return embedding values as a {@link List} of {@link Double}
     * @throws RuntimeException if the API call fails or returns an unexpected response
     */
    public List<Double> getEmbeddingValues(String text, String model, String apiKey) {
        try {
            // Build request body
            ObjectNode body = objectMapper.createObjectNode();
            ObjectNode content = body.putObject("content");
            ArrayNode parts = content.putArray("parts");
            parts.addObject().put("text", text);

            // Encode the model name for use in the URI (colons are fine, but spaces are not)
            String encodedModel = model.replace(" ", "%20");

            String responseBody = geminiClient()
                    .post()
                    .uri("/v1beta/{model}:embedContent?key={key}", encodedModel, apiKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);
            JsonNode values = root.path("embedding").path("values");

            List<Double> embedding = new ArrayList<>();
            if (values.isArray()) {
                for (JsonNode v : values) {
                    embedding.add(v.asDouble());
                }
            }
            return embedding;

        } catch (Exception err) {
            throw new RuntimeException("Embedding API call failed: " + err.getMessage(), err);
        }
    }

    /**
     * Generates text content using the Gemini generative model.
     *
     * <p>Equivalent to {@code model.generateContent(prompt)} in {@code ai.service.ts}.
     * Calls {@code POST /v1beta/{model}:generateContent}.
     *
     * @param prompt   the full prompt string to send to the model
     * @param model    Gemini model name (e.g. {@code gemini-2.5-flash})
     * @param apiKey   Gemini API key
     * @return generated text
     * @throws RuntimeException if the API call fails or the response is malformed
     */
    public String generateContent(String prompt, String model, String apiKey) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            ArrayNode contents = body.putArray("contents");
            ObjectNode content = contents.addObject();
            ArrayNode parts = content.putArray("parts");
            parts.addObject().put("text", prompt);

            String encodedModel = model.replace(" ", "%20");

            String responseBody = geminiClient()
                    .post()
                    .uri("/v1beta/{model}:generateContent?key={key}", encodedModel, apiKey)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(responseBody);

            // Navigate: candidates[0].content.parts[0].text
            JsonNode text = root
                    .path("candidates").path(0)
                    .path("content").path("parts").path(0)
                    .path("text");

            if (!text.isMissingNode()) {
                return text.asText();
            }

            throw new RuntimeException("Unexpected Gemini response: " + responseBody);

        } catch (Exception err) {
            throw new RuntimeException("generateContent failed: " + err.getMessage(), err);
        }
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Normalizes whitespace and picks the most informative snippet from a markdown string.
     *
     * <p>Equivalent to {@code pickMarkdownSnippet()} in {@code scraper.ts}.
     * Prefers lines that contain role-related keywords; falls back to the first 4 000 chars.
     *
     * @param markdown raw markdown string from Firecrawl
     * @return cleaned snippet (up to 4 000 characters)
     */
    private String pickMarkdownSnippet(String markdown) {
        // Normalise line endings and collapse repeated spaces/tabs
        String normalized = markdown
                .replace("\r\n", "\n")
                .replace("\r", "\n")
                .replaceAll("[ \\t]+", " ");

        String[] lines = normalized.split("\n");
        for (String line : lines) {
            String trimmed = line.trim();
            if (trimmed.length() > 2 && ROLE_LINE_PATTERN.matcher(trimmed).find()) {
                // Return the first role-bearing line (capped at 4 000 chars)
                return trimmed.substring(0, Math.min(trimmed.length(), 4000));
            }
        }

        // Fallback: first 4 000 chars of the full normalized content
        return normalized.strip().substring(0, Math.min(normalized.strip().length(), 4000));
    }
}
