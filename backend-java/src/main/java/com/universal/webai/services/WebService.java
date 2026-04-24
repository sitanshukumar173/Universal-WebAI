package com.universal.webai.services;

import com.universal.webai.models.Sitemap;
import com.universal.webai.models.Website;
import com.universal.webai.repositories.SitemapRepository;
import com.universal.webai.repositories.WebsiteRepository;
import com.universal.webai.scraper.Scraper;
import com.universal.webai.types.VectorSearchHit;
import org.bson.Document;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.aggregation.Aggregation;
import org.springframework.data.mongodb.core.aggregation.AggregationOperation;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Web / sitemap service — crawls websites, stores embeddings, and performs vector search.
 *
 * <p>Equivalent to {@code web.service.ts} in the Node.js backend.
 * Provides:
 * <ul>
 *   <li>{@link #mapNewWebsite} — async background full-site crawl + embedding storage</li>
 *   <li>{@link #vectorSearch} — MongoDB Atlas {@code $vectorSearch} aggregation</li>
 * </ul>
 */
@Service
public class WebService {

    private static final Logger log = LoggerFactory.getLogger(WebService.class);

    private final Scraper scraper;
    private final AiService aiService;
    private final WebsiteRepository websiteRepository;
    private final SitemapRepository sitemapRepository;
    private final MongoTemplate mongoTemplate;

    public WebService(
            Scraper scraper,
            AiService aiService,
            WebsiteRepository websiteRepository,
            SitemapRepository sitemapRepository,
            MongoTemplate mongoTemplate) {
        this.scraper = scraper;
        this.aiService = aiService;
        this.websiteRepository = websiteRepository;
        this.sitemapRepository = sitemapRepository;
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * Crawls all pages of a website, embeds each URL, and persists the results.
     *
     * <p>Equivalent to {@code mapNewWebsite(domain, websiteUrl)} in {@code web.service.ts}.
     * This method is annotated {@link Async} so it runs in a background thread and does not
     * block the initial query response — matching the {@code void mapNewWebsite(...)} fire-and-forget
     * pattern in the Node.js code.
     *
     * @param domain     hostname of the site (e.g. {@code "example.com"})
     * @param websiteUrl root URL of the site to crawl
     */
    @Async
    public void mapNewWebsite(String domain, String websiteUrl) {
        long startedAt = System.currentTimeMillis();
        log.info("[MAP][START] domain={} baseUrl={}", domain, websiteUrl);

        // Discover all page URLs via the Firecrawl map endpoint
        List<String> rawLinks = scraper.mapWebsite(websiteUrl);
        int rawCount = rawLinks.size();
        log.info("[MAP][CRAWL] domain={} discoveredLinks={}", domain, rawCount);

        if (rawLinks.isEmpty()) {
            log.warn("[MAP][DONE] domain={} status=no-links total=0 success=0 failed=0 durationMs={}",
                    domain, System.currentTimeMillis() - startedAt);
            return;
        }

        // De-duplicate links (preserving insertion order)
        List<String> uniqueLinks = rawLinks.stream()
                .distinct()
                .collect(Collectors.toList());
        log.info("[MAP][CRAWL] domain={} uniqueLinks={}", domain, uniqueLinks.size());

        int total = uniqueLinks.size();
        int[] processed = {0}, success = {0}, failed = {0};
        Map<String, Integer> errorBuckets = new LinkedHashMap<>();

        // Embed each URL and upsert the sitemap document
        for (int index = 0; index < total; index++) {
            String url = uniqueLinks.get(index);
            int displayIndex = index + 1;

            if (url == null || url.isBlank()) {
                failed[0]++;
                processed[0]++;
                log.warn("[MAP][SKIP] domain={} index={}/{} reason=missing-url progress={}/{}",
                        domain, displayIndex, total, processed[0], total);
                continue;
            }

            try {
                // Build text to embed: use URL slug as a proxy for page title
                // (same heuristic as the Node.js backend when no title is available)
                String[] segments = url.split("/");
                String slug = segments.length > 0 ? segments[segments.length - 1] : domain;
                String textToEmbed = slug.isBlank() ? domain : slug;

                List<Double> vector = aiService.getEmbedding(textToEmbed);

                // Upsert the sitemap entry (equivalent to findOneAndUpdate with upsert:true)
                upsertSitemap(domain, url, textToEmbed, vector);

                success[0]++;
                processed[0]++;
                log.info("[MAP][OK] domain={} index={}/{} progress={}/{} url={}",
                        domain, displayIndex, total, processed[0], total, url);

            } catch (Exception err) {
                failed[0]++;
                processed[0]++;
                String errorMessage = err.getMessage() != null ? err.getMessage() : err.toString();
                String errorKey = errorMessage.substring(0, Math.min(errorMessage.length(), 120));
                errorBuckets.merge(errorKey, 1, Integer::sum);
                log.error("[MAP][ERROR] domain={} index={}/{} progress={}/{} url={} error={}",
                        domain, displayIndex, total, processed[0], total, url, errorMessage);
            }
        }

        // Mark the domain as fully mapped so subsequent requests skip the crawl
        upsertWebsite(domain, true);

        long elapsedMs = System.currentTimeMillis() - startedAt;
        log.info("[MAP][DONE] domain={} total={} success={} failed={} durationMs={}",
                domain, total, success[0], failed[0], elapsedMs);

        if (failed[0] > 0) {
            String errorSummary = errorBuckets.entrySet().stream()
                    .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                    .limit(10)
                    .map(e -> e.getValue() + "x " + e.getKey())
                    .collect(Collectors.joining(" | "));
            log.warn("[MAP][ERROR_SUMMARY] domain={} topErrors={}", domain, errorSummary);
        }
    }

    /**
     * Performs a vector similarity search against the {@code sitemaps} collection.
     *
     * <p>Equivalent to {@code vectorSearch(questionVector, domain)} in {@code web.service.ts}.
     * Uses the MongoDB Atlas {@code $vectorSearch} aggregation stage (requires a
     * {@code vector_index} index on the {@code embedding} field).
     *
     * @param questionVector dense embedding of the user's question
     * @param domain         hostname to restrict the search to
     * @return list of matching {@link VectorSearchHit} records
     */
    public List<VectorSearchHit> vectorSearch(List<Double> questionVector, String domain) {
        // Build the $vectorSearch stage as a raw BSON document
        // (Spring Data MongoDB does not yet provide a typed builder for this stage)
        Document vectorSearchStage = new Document("$vectorSearch", new Document()
                .append("index", "vector_index")
                .append("path", "embedding")
                .append("queryVector", questionVector)
                .append("numCandidates", 50)
                .append("limit", 1));

        // $project: return url, domain and the similarity score
        Document projectStage = new Document("$project", new Document()
                .append("url", 1)
                .append("domain", 1)
                .append("score", new Document("$meta", "vectorSearchScore")));

        // $match: restrict to the queried domain
        Document matchStage = new Document("$match", new Document("domain", domain));

        List<Document> pipeline = List.of(vectorSearchStage, projectStage, matchStage);

        List<Document> rawResults = mongoTemplate.getDb()
                .getCollection("sitemaps")
                .aggregate(pipeline)
                .into(new ArrayList<>());

        return rawResults.stream()
                .map(doc -> new VectorSearchHit(
                        doc.getString("url"),
                        doc.getDouble("score") != null ? doc.getDouble("score") : 0.0))
                .collect(Collectors.toList());
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Upserts a website record (equivalent to
     * {@code WebsiteModel.updateOne({ domain }, { domain, isMapped }, { upsert: true })}).
     */
    private void upsertWebsite(String domain, boolean isMapped) {
        mongoTemplate.upsert(
                Query.query(Criteria.where("domain").is(domain)),
                Update.update("domain", domain).set("isMapped", isMapped),
                Website.class);
    }

    /**
     * Upserts a sitemap (page) record (equivalent to
     * {@code SitemapModel.findOneAndUpdate({ url }, { domain, url, title, embedding }, { upsert: true })}).
     */
    private void upsertSitemap(String domain, String url, String title, List<Double> embedding) {
        mongoTemplate.upsert(
                Query.query(Criteria.where("url").is(url)),
                Update.update("url", url)
                        .set("domain", domain)
                        .set("title", title)
                        .set("embedding", embedding),
                Sitemap.class);
    }
}
