package com.universal.webai.types;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Represents a single vector search hit returned by the MongoDB {@code $vectorSearch} pipeline.
 *
 * <p>Equivalent to {@code VectorSearchHit} in {@code types.ts}.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class VectorSearchHit {

    /** The URL of the matched sitemap entry. */
    private String url;

    /** The cosine similarity score (0–1); higher is more relevant. */
    private double score;
}
