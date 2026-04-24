package com.universal.webai.types;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * Represents the structured extraction result returned by the Firecrawl scrape API.
 *
 * <p>Equivalent to {@code ExtractCompatResult} in {@code types.ts}.
 *
 * <p>Fields:
 * <ul>
 *   <li>{@code success} — whether the scrape / extraction succeeded</li>
 *   <li>{@code extract} — the extracted data (may be {@code null} on failure)</li>
 * </ul>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ExtractCompatResult {

    /** {@code true} if the scrape API call returned usable data. */
    private boolean success;

    /** The extracted structured data; {@code null} when {@code success} is {@code false}. */
    private Extract extract;

    /**
     * Inner DTO holding the fields extracted from a page.
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Extract {

        /** The main answer text extracted from the page. */
        private String answer;

        /** Additional supporting detail text from the page. */
        private String details;

        /** Whether the answer was found inside a PDF resource. */
        private Boolean foundInPdf;

        /** Any extra fields returned by the Firecrawl structured extraction. */
        private Map<String, Object> extra;
    }
}
