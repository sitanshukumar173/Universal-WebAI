package com.universal.webai.models;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.util.List;

/**
 * MongoDB document model for individual crawled pages (the site map).
 *
 * <p>Equivalent to {@code SitemapSchema / SitemapModel} in {@code models.ts}.
 * Stored in the {@code sitemaps} collection.
 *
 * <p>Fields:
 * <ul>
 *   <li>{@code domain} — parent hostname of the crawled page</li>
 *   <li>{@code url} — unique full URL of the page</li>
 *   <li>{@code title} — page title (may be empty)</li>
 *   <li>{@code description} — optional page description</li>
 *   <li>{@code embedding} — vector embedding used for semantic search</li>
 * </ul>
 */
@Data
@NoArgsConstructor
@Document(collection = "sitemaps")
public class Sitemap {

    @Id
    private String id;

    /** Parent domain — e.g. {@code "example.com"} */
    private String domain;

    /** Unique URL of the crawled page */
    @Indexed(unique = true)
    private String url;

    /** Page title (may be empty string) */
    private String title;

    /** Optional page description */
    private String description;

    /**
     * Dense vector embedding of the page content / title, used for
     * {@code $vectorSearch} aggregation in MongoDB Atlas.
     */
    private List<Double> embedding;
}
