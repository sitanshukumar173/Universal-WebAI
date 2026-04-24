package com.universal.webai.repositories;

import com.universal.webai.models.Website;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data MongoDB repository for the {@code websites} collection.
 *
 * <p>Provides the same query operations that the Node.js backend performs
 * directly on the {@code WebsiteModel} Mongoose model:
 * <ul>
 *   <li>{@code WebsiteModel.findOne({ domain })} → {@link #findByDomain}</li>
 *   <li>{@code WebsiteModel.updateOne(…, { upsert: true })} → handled via {@link #save}</li>
 * </ul>
 */
@Repository
public interface WebsiteRepository extends MongoRepository<Website, String> {

    /** Find a site record by its unique hostname. */
    Optional<Website> findByDomain(String domain);
}
