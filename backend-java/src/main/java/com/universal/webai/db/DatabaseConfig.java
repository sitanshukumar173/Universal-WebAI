package com.universal.webai.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.stereotype.Component;

/**
 * Database configuration / connection verifier.
 *
 * <p>This is the Java equivalent of {@code db.ts} in the Node.js backend.
 * Spring Data MongoDB auto-configures the connection from
 * {@code spring.data.mongodb.uri} in {@code application.properties}.
 * This component simply verifies the connection after the application
 * starts and logs the result — mirroring the {@code connectDB()} function.
 */
@Component
public class DatabaseConfig {

    private static final Logger log = LoggerFactory.getLogger(DatabaseConfig.class);

    private final MongoTemplate mongoTemplate;

    public DatabaseConfig(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    /**
     * Verifies the MongoDB connection once the application is fully started.
     * Equivalent to {@code connectDB()} called at application startup in {@code index.ts}.
     */
    @EventListener(ApplicationReadyEvent.class)
    public void verifyConnection() {
        try {
            // Ping the database — throws if the connection is unavailable
            mongoTemplate.getDb().runCommand(
                    new org.bson.Document("ping", 1));
            log.info("MongoDB Connected Successfully");
        } catch (Exception err) {
            log.error(" DB Connection Error: {}", err.getMessage(), err);
            // Exit with a non-zero status, same behaviour as process.exit(1) in Node.js
            System.exit(1);
        }
    }
}
