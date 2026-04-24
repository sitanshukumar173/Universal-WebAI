package com.universal.webai.models;

import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

/**
 * MongoDB document model for tracked websites.
 *
 * <p>Equivalent to {@code WebsiteSchema / WebsiteModel} in {@code models.ts}.
 * Stored in the {@code websites} collection.
 *
 * <p>Fields:
 * <ul>
 *   <li>{@code domain} — unique hostname of the site (e.g. {@code example.com})</li>
 *   <li>{@code isMapped} — whether the full-site URL mapping has completed</li>
 * </ul>
 */
@Data
@NoArgsConstructor
@Document(collection = "websites")
public class Website {

    @Id
    private String id;

    /** Unique hostname — e.g. {@code "example.com"} */
    @Indexed(unique = true)
    private String domain;

    /**
     * Whether all pages of this domain have been crawled and embedded.
     * Defaults to {@code false} until background mapping completes.
     */
    private boolean isMapped = false;

    public Website(String domain) {
        this.domain = domain;
    }
}
