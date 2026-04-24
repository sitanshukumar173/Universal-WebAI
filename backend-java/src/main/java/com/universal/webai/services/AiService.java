package com.universal.webai.services;

import com.universal.webai.scraper.Scraper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * AI service — wraps the Google Gemini REST API.
 *
 * <p>Equivalent to {@code ai.service.ts} in the Node.js backend.
 * Provides:
 * <ul>
 *   <li>{@link #getEmbedding} — convert text → dense vector</li>
 *   <li>{@link #synthesizeAnswer} — generate a concise answer from extracted context</li>
 *   <li>{@link #synthesizeRelevantLinks} — choose the most relevant source URLs</li>
 * </ul>
 */
@Service
public class AiService {

    private static final Logger log = LoggerFactory.getLogger(AiService.class);

    // ── Configuration ──────────────────────────────────────────────────────────

    private final String geminiKey;
    private final String embeddingModel;
    private final String answerModel;
    private final List<String> fallbackAnswerModels;
    private final Scraper scraper;

    /** Model IDs that are blocked from use (known to be problematic). */
    private static final Set<String> BLOCKED_MODEL_IDS = Set.of("gemini-1.5-pro");

    /** HTTP status codes that are safe to retry on. */
    private static final Set<Integer> RETRYABLE_STATUS = Set.of(429, 500, 503, 504);

    // ── NLP constants ──────────────────────────────────────────────────────────

    private static final List<String> ROLE_TERMS = List.of(
            "director", "dean", "hod", "head", "chairperson",
            "principal", "registrar", "vice chancellor", "vc"
    );

    private static final Pattern INSUFFICIENT_PATTERN = Pattern.compile(
            "not explicitly|insufficient|not provided|not available|cannot be determined|" +
            "not mentioned|not stated|unable to find",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern ROLE_PATTERN_CHECK = Pattern.compile(
            "who|name|director|dean|hod|principal|chairperson",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern HONORIFIC_PATTERN = Pattern.compile(
            "\\b(?:Dr|Prof|Mr|Ms|Mrs)\\.?\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,3}\\b",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern PLAIN_NAME_PATTERN = Pattern.compile(
            "\\b[A-Za-z][A-Za-z'.\\-]+\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,2}\\b");

    private static final Pattern ROLE_LINE_PATTERN = Pattern.compile(
            "director|dean|hod|chairperson|principal|registrar",
            Pattern.CASE_INSENSITIVE);

    private static final Pattern HONORIFIC_LINE_PATTERN = Pattern.compile(
            "dr\\.|prof\\.|mr\\.|ms\\.|mrs\\.",
            Pattern.CASE_INSENSITIVE);

    private static final Set<String> STOP_WORDS = Set.of(
            "what", "who", "which", "when", "where", "the", "is",
            "are", "of", "for", "and", "name", "please", "tell");

    public AiService(
            @Value("${gemini.key}") String geminiKey,
            @Value("${gemini.embedding.model:models/gemini-embedding-001}") String embeddingModel,
            @Value("${gemini.answer.model:gemini-2.5-flash}") String answerModel,
            @Value("${gemini.answer.fallback.models:}") String fallbackModelsRaw,
            Scraper scraper) {
        this.geminiKey = geminiKey;
        this.embeddingModel = embeddingModel;
        this.answerModel = answerModel;
        this.scraper = scraper;

        // Parse and validate fallback models (equivalent to FALLBACK_ANSWER_MODELS in ai.service.ts)
        this.fallbackAnswerModels = Arrays.stream(fallbackModelsRaw.split(","))
                .map(String::trim)
                .filter(m -> !m.isEmpty())
                .filter(m -> !m.equalsIgnoreCase(answerModel))
                .filter(m -> !BLOCKED_MODEL_IDS.contains(m.toLowerCase()))
                .collect(Collectors.toList());
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Converts text to a dense embedding vector using the Gemini embedding model.
     *
     * <p>Equivalent to {@code getEmbedding(text)} in {@code ai.service.ts}.
     *
     * @param text the text to embed
     * @return embedding vector as a {@link List} of {@link Double}
     */
    public List<Double> getEmbedding(String text) {
        return scraper.getEmbeddingValues(text, embeddingModel, geminiKey);
    }

    /**
     * Synthesizes a concise answer from the extracted page context.
     *
     * <p>Equivalent to {@code synthesizeAnswer(question, context)} in {@code ai.service.ts}.
     * Tries deterministic extraction first for name/role questions, then falls back to
     * the Gemini generative model with retry logic, and finally to a heuristic extractor.
     *
     * @param question the user's original question
     * @param context  concatenated extraction snippets from all scraped sources
     * @return the best available answer string
     */
    public String synthesizeAnswer(String question, String context) {
        // For name/role questions, try fast deterministic extraction first
        if (shouldBeShortAnswer(question)) {
            String deterministic = extractShortAnswerFromContext(question, context);
            if (deterministic != null && !deterministic.isBlank()) {
                return deterministic;
            }
        }

        try {
            String prompt = """
                    You are a strict factual assistant.

                    User question:
                    "%s"

                    Extracted website context:
                    %s

                    Instructions:
                    - Answer only from the provided context.
                    - If the context is insufficient, clearly say what is missing.
                    - Prefer exact facts, numbers, dates, names, and conditions.
                    - Keep the final answer concise, refined, and directly useful.
                    - If multiple extracted snippets conflict, mention the conflict briefly.
                    - If a PDF/source indicator appears in context, mention that in one short line.
                    - Do NOT return headings, bullets, numbering, labels, markdown, or explanation blocks.
                    - Return only the final answer text.
                    - If question asks for a person name/title (like director name), return only the exact name.

                    Output format:
                    Plain text answer only.
                    """.formatted(question, context);

            String text = generateWithFallback("answer", prompt);
            String cleaned = stripAnswerBoilerplate(text);

            if (cleaned == null || cleaned.isBlank()) {
                return buildFallbackAnswer(question, context);
            }

            if (shouldBeShortAnswer(question)) {
                if (INSUFFICIENT_PATTERN.matcher(cleaned).find()) {
                    String shortAnswer = extractShortAnswerFromContext(question, context);
                    if (shortAnswer != null && !shortAnswer.isBlank()) return shortAnswer;
                }
                String person = extractPersonName(cleaned);
                if (person != null) return person;

                String firstLine = Arrays.stream(cleaned.split("\n"))
                        .filter(l -> !l.isBlank())
                        .findFirst()
                        .orElse(cleaned);
                return firstLine.trim();
            }

            return cleaned;

        } catch (Exception error) {
            log.error("Failed to synthesize answer: {}", error.getMessage(), error);
            return buildFallbackAnswer(question, context);
        }
    }

    /**
     * Selects up to 3 most relevant source URLs using the Gemini model.
     *
     * <p>Equivalent to {@code synthesizeRelevantLinks(question, context, sources)} in
     * {@code ai.service.ts}.
     *
     * @param question the user's question
     * @param context  extracted text context
     * @param sources  candidate URL list (AI must choose from this list only)
     * @return up to 3 relevant URLs (de-duplicated)
     */
    public List<String> synthesizeRelevantLinks(String question, String context, List<String> sources) {
        try {
            String prompt = """
                    The user asked: "%s"
                    Extracted website data: %s
                    Allowed links:
                    %s

                    Return ONLY a JSON array of up to 3 URLs from the allowed links that are most relevant to the answer.
                    Do not include any markdown, labels, or extra text.
                    If none are relevant, return an empty array.
                    """.formatted(question, context, String.join("\n", sources));

            String text = generateWithFallback("links", prompt).strip();
            // Strip possible markdown code fences
            String jsonText = text
                    .replaceFirst("^```json\\s*", "")
                    .replaceFirst("^```\\s*", "")
                    .replaceFirst("\\s*```$", "");

            // Parse the JSON array of URLs
            com.fasterxml.jackson.databind.ObjectMapper mapper =
                    new com.fasterxml.jackson.databind.ObjectMapper();
            List<String> parsed = mapper.readValue(jsonText,
                    mapper.getTypeFactory().constructCollectionType(List.class, String.class));

            return parsed.stream()
                    .filter(Objects::nonNull)
                    .distinct()
                    .limit(3)
                    .collect(Collectors.toList());

        } catch (Exception error) {
            log.error("Failed to synthesize relevant links: {}",
                    truncate(normalizeText(error.getMessage()), 220), error);
        }

        // Deterministic fallback: first 3 distinct sources
        return sources.stream().distinct().limit(3).collect(Collectors.toList());
    }

    // ── Private: AI call with retry / model fallback ───────────────────────────

    /**
     * Calls the Gemini generate API with retry and model-fallback logic.
     *
     * <p>Equivalent to {@code generateWithFallback(purpose, prompt)} in {@code ai.service.ts}.
     * Tries the primary model up to 3 times (with exponential back-off for retryable errors),
     * then attempts each fallback model in order.
     *
     * @param purpose descriptive label used in log messages ({@code "answer"} or {@code "links"})
     * @param prompt  the full LLM prompt
     * @return the generated text
     * @throws RuntimeException if all model attempts fail (only for {@code purpose="answer"})
     */
    private String generateWithFallback(String purpose, String prompt) {
        List<String> modelsToTry = new ArrayList<>();
        modelsToTry.add(answerModel);
        modelsToTry.addAll(fallbackAnswerModels);

        RuntimeException lastError = null;

        for (String modelName : modelsToTry) {
            for (int attempt = 1; attempt <= 3; attempt++) {
                long startedAt = System.currentTimeMillis();
                try {
                    log.info("[AI][{}][TRY] model={} attempt={}", purpose.toUpperCase(), modelName, attempt);
                    String result = scraper.generateContent(prompt, modelName, geminiKey);
                    log.info("[AI][{}][OK] model={} attempt={} durationMs={}",
                            purpose.toUpperCase(), modelName, attempt,
                            System.currentTimeMillis() - startedAt);
                    return result;

                } catch (Exception error) {
                    String message = error.getMessage() != null ? error.getMessage() : error.toString();
                    lastError = new RuntimeException(message, error);

                    boolean retryable = isRetryableError(message);
                    log.error("[AI][{}][ERROR] model={} attempt={} retryable={} message={}",
                            purpose.toUpperCase(), modelName, attempt, retryable,
                            truncate(normalizeText(message), 220));

                    // 404 means the model is unavailable — skip remaining attempts for this model
                    if (message.contains("404")) break;

                    if (!retryable) break;

                    if (attempt < 3) {
                        long delayMs = 500L * attempt;
                        log.info("[AI][{}][RETRY_WAIT] model={} delayMs={}", purpose.toUpperCase(), modelName, delayMs);
                        try { Thread.sleep(delayMs); } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                        }
                    }
                }
            }
        }

        // For links, never throw — return an empty array so the query flow stays healthy
        if ("links".equals(purpose)) return "[]";

        throw lastError != null ? lastError : new RuntimeException("All AI model attempts failed");
    }

    // ── Private: text analysis helpers ────────────────────────────────────────

    /** Returns {@code true} if the error message indicates a transient/rate-limit failure. */
    private boolean isRetryableError(String message) {
        if (message == null) return false;
        return message.matches(".*?(503|429|unavailable|timeout|temporar|high demand).*");
    }

    /** Returns {@code true} if the question is asking for a short name/role answer. */
    private boolean shouldBeShortAnswer(String question) {
        return ROLE_PATTERN_CHECK.matcher(question).find();
    }

    /** Collects role keywords present in the question. */
    private List<String> getRoleKeywordsFromQuestion(String question) {
        String q = question.toLowerCase();
        return ROLE_TERMS.stream().filter(q::contains).collect(Collectors.toList());
    }

    /**
     * Deterministic short-answer extractor.
     * Tries to locate a person name near a role keyword in the context.
     *
     * <p>Equivalent to {@code extractShortAnswerFromContext()} in {@code ai.service.ts}.
     */
    private String extractShortAnswerFromContext(String question, String rawContext) {
        List<String> roleKeywords = getRoleKeywordsFromQuestion(question);
        String normalizedContext = normalizeLineBreaks(rawContext).replaceAll("\\s+", " ");

        if (!roleKeywords.isEmpty()) {
            String roleAlt = roleKeywords.stream()
                    .map(k -> k.replace(" ", "\\s+"))
                    .collect(Collectors.joining("|"));

            // Pattern: role keyword then name within 40 chars
            Pattern roleThenName = Pattern.compile(
                    "(?:" + roleAlt + ")[^A-Za-z]{0,40}" +
                    "((?:Dr|Prof|Mr|Ms|Mrs)\\.?\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,3}" +
                    "|[A-Za-z][A-Za-z'.\\-]+\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,2})",
                    Pattern.CASE_INSENSITIVE);

            java.util.regex.Matcher m1 = roleThenName.matcher(normalizedContext);
            if (m1.find() && m1.group(1) != null) {
                String cleaned = cleanExtractedName(m1.group(1));
                if (!cleaned.isBlank()) return cleaned;
            }

            // Pattern: name then role keyword within 40 chars
            Pattern nameThenRole = Pattern.compile(
                    "((?:Dr|Prof|Mr|Ms|Mrs)\\.?\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,3}" +
                    "|[A-Za-z][A-Za-z'.\\-]+\\s+[A-Za-z][A-Za-z'.\\-]+(?:\\s+[A-Za-z][A-Za-z'.\\-]+){0,2})" +
                    "[^A-Za-z]{0,40}(?:" + roleAlt + ")",
                    Pattern.CASE_INSENSITIVE);

            java.util.regex.Matcher m2 = nameThenRole.matcher(normalizedContext);
            if (m2.find() && m2.group(1) != null) {
                String cleaned = cleanExtractedName(m2.group(1));
                if (!cleaned.isBlank()) return cleaned;
            }
        }

        // Line-by-line search
        String[] lines = normalizeLineBreaks(rawContext).split("\n");
        List<String> nonEmptyLines = Arrays.stream(lines)
                .map(String::trim)
                .filter(l -> l.length() > 2)
                .collect(Collectors.toList());

        // Preference 1: line with role keyword + person name
        for (String line : nonEmptyLines) {
            String lower = line.toLowerCase();
            if (!roleKeywords.isEmpty() && roleKeywords.stream().noneMatch(lower::contains)) continue;
            String person = extractPersonName(line);
            if (person != null) return person;
        }

        // Preference 2: best context line by query overlap
        String bestLine = pickBestContextLine(question, rawContext);
        String personFromBest = extractPersonName(bestLine);
        if (personFromBest != null) return personFromBest;

        // Final fallback: any person name in context
        for (String line : nonEmptyLines) {
            String person = extractPersonName(line);
            if (person != null) return person;
        }

        return "";
    }

    /**
     * Extracts a person name (with or without honorific) from a single text line.
     *
     * <p>Equivalent to {@code extractPersonName()} in {@code ai.service.ts}.
     */
    private String extractPersonName(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = normalizeLineBreaks(value).replaceAll("\\s+", " ").trim();

        java.util.regex.Matcher honorificMatch = HONORIFIC_PATTERN.matcher(value);
        if (honorificMatch.find()) return cleanExtractedName(honorificMatch.group());

        java.util.regex.Matcher plainMatch = PLAIN_NAME_PATTERN.matcher(normalized);
        if (plainMatch.find()) return cleanExtractedName(plainMatch.group());

        return null;
    }

    /**
     * Removes trailing role terms and punctuation from an extracted name.
     *
     * <p>Equivalent to {@code cleanExtractedName()} in {@code ai.service.ts}.
     */
    private String cleanExtractedName(String value) {
        String cleaned = value.replaceAll("\\s+", " ").trim();

        // Drop merged role suffix e.g. "KumarDirectorUIET"
        Pattern mergedRole = Pattern.compile(
                "(" + String.join("|", ROLE_TERMS) + ")", Pattern.CASE_INSENSITIVE);
        java.util.regex.Matcher m = mergedRole.matcher(cleaned);
        if (m.find() && m.start() > 0) {
            cleaned = cleaned.substring(0, m.start()).trim();
        }

        return cleaned.replaceAll("[\\s,;:.\\-]+$", "").trim();
    }

    /**
     * Scores context lines by overlap with the question tokens and returns the best one.
     *
     * <p>Equivalent to {@code pickBestContextLine()} in {@code ai.service.ts}.
     */
    private String pickBestContextLine(String question, String rawContext) {
        String q = normalizeText(question).toLowerCase();
        String[] lines = normalizeLineBreaks(rawContext).split("\n");

        List<String> nonEmptyLines = Arrays.stream(lines)
                .map(String::trim)
                .filter(l -> l.length() > 2)
                .collect(Collectors.toList());

        if (nonEmptyLines.isEmpty()) return "";

        List<String> tokens = Arrays.stream(q.split("[^a-z0-9]+"))
                .map(String::trim)
                .filter(t -> t.length() > 2 && !STOP_WORDS.contains(t))
                .collect(Collectors.toList());

        boolean questionIsRole = ROLE_LINE_PATTERN.matcher(q).find();

        record ScoredLine(String line, int score) {}

        return nonEmptyLines.stream().map(line -> {
            String lower = line.toLowerCase();
            int score = 0;
            for (String token : tokens) {
                if (lower.contains(token)) score += 2;
            }
            if (questionIsRole && ROLE_LINE_PATTERN.matcher(line).find()) score += 4;
            if (HONORIFIC_LINE_PATTERN.matcher(line).find()) score += 1;
            return new ScoredLine(line, score);
        }).max(Comparator.comparingInt(ScoredLine::score))
                .map(ScoredLine::line)
                .orElse("");
    }

    /**
     * Builds a heuristic fallback answer when the AI model is unavailable.
     *
     * <p>Equivalent to {@code buildFallbackAnswer()} inside {@code synthesizeAnswer()} in
     * {@code ai.service.ts}.
     */
    private String buildFallbackAnswer(String question, String rawContext) {
        if (shouldBeShortAnswer(question)) {
            String shortAnswer = extractShortAnswerFromContext(question, rawContext);
            if (shortAnswer != null && !shortAnswer.isBlank()) return shortAnswer;
        }
        String bestLine = pickBestContextLine(question, rawContext);
        if (!bestLine.isBlank()) return stripAnswerBoilerplate(bestLine);
        return "No AI answer is available right now.";
    }

    /**
     * Strips common boilerplate patterns from model-generated text.
     *
     * <p>Equivalent to {@code stripAnswerBoilerplate()} in {@code ai.service.ts}.
     */
    private String stripAnswerBoilerplate(String value) {
        if (value == null) return "";
        String text = normalizeLineBreaks(value)
                .replaceFirst("^```[a-z]*\\s*", "")
                .replaceFirst("\\s*```$", "")
                .replaceFirst("(?i)^\\s*(answer|direct answer)\\s*[:\\-]\\s*", "")
                .replaceFirst("(?i)^\\s*\\d+[).\\s]\\s*direct answer\\s*", "")
                .trim();

        // Drop trailing "Key facts" / "Supporting facts" sections that the model may emit
        String[] sections = text.split(
                "\n\\s*(?:\\d+[).\\s]\\s*)?(?:key facts?|supporting facts?|explanation)\\s*[:\\-]?",
                2);
        text = sections[0].trim();

        return Arrays.stream(text.split("\n"))
                .map(line -> line.replaceFirst("^[-*]\\s+", "").trim())
                .filter(l -> !l.isBlank())
                .collect(Collectors.joining("\n"))
                .trim();
    }

    // ── String utilities ───────────────────────────────────────────────────────

    /** Collapses internal whitespace to a single space. */
    private String normalizeText(String value) {
        if (value == null) return "";
        return value.replaceAll("\\s+", " ").trim();
    }

    /** Normalizes CR/LF line endings to LF. */
    private String normalizeLineBreaks(String value) {
        if (value == null) return "";
        return value.replace("\r\n", "\n").replace("\r", "\n");
    }

    /** Truncates a string to {@code maxChars} characters, appending {@code "..."} if cut. */
    private String truncate(String value, int maxChars) {
        if (value == null) return "";
        return value.length() > maxChars ? value.substring(0, maxChars) + "..." : value;
    }
}
