package com.universal.webai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * Main entry point for the Universal WebAI Spring Boot application.
 *
 * <p>This is the Java equivalent of {@code index.ts} in the Node.js backend.
 * It starts the embedded Tomcat server, configures Spring MVC (routes are
 * registered via {@code @RestController} annotations), connects to MongoDB
 * (auto-configured from {@code application.properties}), and enables
 * asynchronous execution so background website mapping does not block requests.
 *
 * <p>The server listens on port 5000 by default (same as the Node.js backend),
 * so the existing frontend requires no changes.
 */
@SpringBootApplication
@EnableAsync // required for @Async background tasks (e.g. mapNewWebsite)
public class UniversalWebAiApplication {

    public static void main(String[] args) {
        SpringApplication.run(UniversalWebAiApplication.class, args);
        System.out.println(" Universal WebAI Backend Live on port " +
                System.getProperty("server.port", "5000"));
    }
}
