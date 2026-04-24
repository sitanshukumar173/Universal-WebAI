package com.universal.webai.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration — equivalent to the {@code cors()} middleware in the Node.js {@code index.ts}.
 *
 * <p>Allows requests from:
 * <ul>
 *   <li>{@code http://localhost:5173} — the Vite dev server for the React frontend</li>
 *   <li>{@code chrome-extension://*} — the Chrome extension host</li>
 * </ul>
 */
@Configuration
public class CorsConfig {

    @Bean
    public WebMvcConfigurer corsConfigurer() {
        return new WebMvcConfigurer() {
            @Override
            public void addCorsMappings(CorsRegistry registry) {
                registry.addMapping("/**")
                        // Allow the Vite dev server and any Chrome extension origin
                        .allowedOriginPatterns(
                                "http://localhost:5173",
                                "chrome-extension://*"
                        )
                        .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                        .allowedHeaders("*");
            }
        };
    }
}
