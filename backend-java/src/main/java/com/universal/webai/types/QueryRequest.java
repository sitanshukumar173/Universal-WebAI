package com.universal.webai.types;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Incoming JSON body for {@code POST /api/v1/query}.
 *
 * <p>The frontend sends this payload. Old clients may only supply
 * {@code websiteUrl}; new clients send both {@code currentPageUrl} and
 * {@code baseUrl} — exactly the same backward-compatible contract as the
 * Node.js backend.
 */
@Data
@NoArgsConstructor
public class QueryRequest {

    /** The user's natural-language question. */
    private String question;

    /**
     * Legacy field: absolute URL of the page the user is viewing.
     * Used as fallback when {@code currentPageUrl} is absent.
     */
    private String websiteUrl;

    /**
     * Preferred field: absolute URL of the current browser tab page.
     * Takes precedence over {@code websiteUrl}.
     */
    private String currentPageUrl;

    /**
     * Root URL of the site (e.g. {@code https://example.com/}).
     * Derived from {@code currentPageUrl} when absent.
     */
    private String baseUrl;
}
