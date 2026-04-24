package com.universal.webai.types;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Outgoing JSON body for {@code POST /api/v1/query}.
 *
 * <p>Matches the response shape that the existing React/Chrome-extension
 * frontend already expects (see {@code App.jsx}):
 * <pre>{@code
 *   { answer: string, sources: string[], relevantLinks: string[] }
 * }</pre>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class QueryResponse {

    /** AI-synthesized answer to the user's question. */
    private String answer;

    /** All URLs that were scraped to produce the answer. */
    private List<String> sources;

    /** Up to 3 most relevant source URLs selected by the AI. */
    private List<String> relevantLinks;
}
