package com.universal.webai.repositories;

import com.universal.webai.models.Sitemap;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data MongoDB repository for the {@code sitemaps} collection.
 *
 * <p>Provides basic CRUD access; vector search queries are executed via
 * {@code MongoTemplate.aggregate()} in {@link com.universal.webai.services.WebService}
 * because Spring Data does not support {@code $vectorSearch} natively.
 */
@Repository
public interface SitemapRepository extends MongoRepository<Sitemap, String> {

    /** Find a sitemap entry by its unique URL (used to check for duplicates before upsert). */
    Optional<Sitemap> findByUrl(String url);
}
