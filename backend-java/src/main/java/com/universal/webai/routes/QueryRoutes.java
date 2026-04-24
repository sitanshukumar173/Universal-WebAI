package com.universal.webai.routes;

/**
 * Route documentation for the Universal WebAI Java backend.
 *
 * <p>Equivalent to {@code query.routes.ts} in the Node.js backend.
 * In Spring Boot, routes are defined directly on {@code @RestController} classes
 * via {@code @RequestMapping} / {@code @PostMapping} annotations, so a separate
 * router file is not required.  This class exists to mirror the Node.js project
 * structure and to document all API routes in one place.
 *
 * <pre>
 * ┌─────────────────────────────────────────────────────────┐
 * │  Route               Method  Handler class              │
 * ├─────────────────────────────────────────────────────────┤
 * │  /api/v1/query       POST    QueryController#handleQuery │
 * └─────────────────────────────────────────────────────────┘
 * </pre>
 *
 * @see com.universal.webai.controllers.QueryController
 */
public final class QueryRoutes {
    private QueryRoutes() { /* utility class — not instantiable */ }
}
