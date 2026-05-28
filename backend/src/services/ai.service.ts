import { getGenAI } from "../scraper.js";
import Groq from "groq-sdk";

const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "models/gemini-embedding-001";
const GROQ_ANSWER_MODEL =
  process.env.GROQ_ANSWER_MODEL || "llama-3.1-8b-instant";
const GROQ_FALLBACK_MODELS = (process.env.GROQ_ANSWER_FALLBACK_MODELS || "")
  .split(",")
  .map((m: string) => m.trim())
  .filter((m: string) => {
    if (!m) return false;
    const normalized = m.toLowerCase();
    if (normalized === GROQ_ANSWER_MODEL.toLowerCase()) return false;
    return true;
  });

const RETRYABLE_STATUS = new Set([429, 500, 503, 504]);
const EMBEDDING_CACHE_TTL_MS = 15 * 60 * 1000;

type EmbeddingCacheEntry = {
  expiresAt: number;
  value: number[];
};

const embeddingCache = new Map<string, EmbeddingCacheEntry>();
let groqClient: Groq | null = null;

const getGroqClient = () => {
  if (groqClient) {
    return groqClient;
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.GORQ_KEY;
  if (!apiKey) {
    throw new Error(
      "GROQ_API_KEY (or GORQ_KEY) environment variable is not set",
    );
  }

  groqClient = new Groq({ apiKey });
  return groqClient;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeEmbeddingKey = (value: string) =>
  normalizeLineBreaks(value).toLowerCase().replace(/\s+/g, " ").trim();

const getCachedEmbedding = (key: string) => {
  const hit = embeddingCache.get(key);
  if (!hit) return null;

  if (hit.expiresAt <= Date.now()) {
    embeddingCache.delete(key);
    return null;
  }

  return hit.value.slice();
};

const setCachedEmbedding = (key: string, value: number[]) => {
  embeddingCache.set(key, {
    value: value.slice(),
    expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS,
  });
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeLineBreaks = (value: string) =>
  value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const truncate = (value: string, maxChars: number) =>
  value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;

const isInsufficientAnswer = (value: string) =>
  /(not explicitly|insufficient|not provided|not available|cannot be determined|not mentioned|not stated|unable to find)/i.test(
    value,
  );

const ROLE_TERMS = [
  "director",
  "dean",
  "hod",
  "head",
  "chairperson",
  "principal",
  "registrar",
  "vice chancellor",
  "vc",
];

const cleanExtractedName = (value: string) => {
  let cleaned = value.replace(/\s+/g, " ").trim();

  const mergedRolePattern = new RegExp(`(${ROLE_TERMS.join("|")})`, "i");
  const mergedIndex = cleaned.search(mergedRolePattern);
  if (mergedIndex > 0) {
    cleaned = cleaned.slice(0, mergedIndex).trim();
  }

  cleaned = cleaned.replace(/[\s,;:.\-]+$/, "").trim();
  return cleaned;
};

const extractPersonName = (value: string): string | null => {
  const normalized = normalizeLineBreaks(value).replace(/\s+/g, " ").trim();

  const honorificMatch = value.match(
    /\b(?:Dr|Prof|Mr|Ms|Mrs)\.?\s+[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,3}\b/i,
  );
  if (honorificMatch) return cleanExtractedName(honorificMatch[0]);

  const plainNameMatch = normalized.match(
    /\b[A-Za-z][A-Za-z'.-]+\s+[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+){0,2}\b/,
  );
  if (plainNameMatch) return cleanExtractedName(plainNameMatch[0]);

  return null;
};

const stripAnswerBoilerplate = (value: string) => {
  const text = normalizeLineBreaks(value)
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^\s*(answer|direct answer)\s*[:\-]\s*/i, "")
    .replace(/^\s*\d+[\).]\s*direct answer\s*/i, "")
    .trim();

  const mainSection =
    text.split(
      /\n\s*(\d+[\).]\s*)?(key facts?|supporting facts?|explanation)\s*[:\-]?/i,
    )[0] ?? text;
  const withoutExtraSections = mainSection.trim();

  return withoutExtraSections
    .split("\n")
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
};

const pickBestContextLine = (question: string, rawContext: string) => {
  const q = normalizeText(question).toLowerCase();
  const lines = normalizeLineBreaks(rawContext)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  if (lines.length === 0) return "";

  const stopwords = new Set([
    "what",
    "who",
    "which",
    "when",
    "where",
    "the",
    "is",
    "are",
    "of",
    "for",
    "and",
    "name",
    "please",
    "tell",
  ]);

  const tokens = q
    .split(/[^a-z0-9]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !stopwords.has(t));

  const scored = lines.map((line) => {
    const l = line.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (l.includes(token)) score += 2;
    }
    if (/director|dean|hod|chairperson|principal|registrar/.test(q)) {
      if (/director|dean|hod|chairperson|principal|registrar/i.test(line)) {
        score += 4;
      }
    }
    if (/dr\.|prof\.|mr\.|ms\.|mrs\./i.test(line)) {
      score += 1;
    }
    return { line, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.line ?? "";
};

const shouldBeShortAnswer = (question: string) => {
  const q = question.toLowerCase();
  return /(who|name|director|dean|hod|principal|chairperson)/.test(q);
};

const getRoleKeywordsFromQuestion = (question: string) => {
  const q = question.toLowerCase();
  return ROLE_TERMS.filter((keyword) => q.includes(keyword));
};

const extractShortAnswerFromContext = (
  question: string,
  rawContext: string,
) => {
  const roleKeywords = getRoleKeywordsFromQuestion(question);
  const normalizedContext = normalizeLineBreaks(rawContext).replace(
    /\s+/g,
    " ",
  );

  if (roleKeywords.length > 0) {
    const rolePattern = roleKeywords
      .map((k) => k.replace(/\s+/g, "\\s+"))
      .join("|");
    const roleThenName = new RegExp(
      `(?:${rolePattern})[^A-Za-z]{0,40}((?:Dr|Prof|Mr|Ms|Mrs)\\.?\\s+[A-Za-z][A-Za-z'.-]+(?:\\s+[A-Za-z][A-Za-z'.-]+){0,3}|[A-Za-z][A-Za-z'.-]+\\s+[A-Za-z][A-Za-z'.-]+(?:\\s+[A-Za-z][A-Za-z'.-]+){0,2})`,
      "i",
    );
    const nameThenRole = new RegExp(
      `((?:Dr|Prof|Mr|Ms|Mrs)\\.?\\s+[A-Za-z][A-Za-z'.-]+(?:\\s+[A-Za-z][A-Za-z'.-]+){0,3}|[A-Za-z][A-Za-z'.-]+\\s+[A-Za-z][A-Za-z'.-]+(?:\\s+[A-Za-z][A-Za-z'.-]+){0,2})[^A-Za-z]{0,40}(?:${rolePattern})`,
      "i",
    );

    const roleThenNameMatch = normalizedContext.match(roleThenName);
    if (roleThenNameMatch?.[1]) {
      const cleaned = cleanExtractedName(roleThenNameMatch[1]);
      if (cleaned) return cleaned;
    }

    const nameThenRoleMatch = normalizedContext.match(nameThenRole);
    if (nameThenRoleMatch?.[1]) {
      const cleaned = cleanExtractedName(nameThenRoleMatch[1]);
      if (cleaned) return cleaned;
    }
  }

  const lines = normalizeLineBreaks(rawContext)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      roleKeywords.length > 0 &&
      !roleKeywords.some((k) => lower.includes(k))
    ) {
      continue;
    }
    const person = extractPersonName(line);
    if (person) return person;
  }

  const bestLine = pickBestContextLine(question, rawContext);
  const personFromBest = extractPersonName(bestLine);
  if (personFromBest) return personFromBest;

  for (const line of lines) {
    const person = extractPersonName(line);
    if (person) return person;
  }

  return "";
};

const isRetryableError = (error: unknown) => {
  if (!error || typeof error !== "object") return false;
  const maybeStatus = (error as { status?: number }).status;
  if (typeof maybeStatus === "number" && RETRYABLE_STATUS.has(maybeStatus)) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown }).message ?? error);
  return /(503|429|unavailable|timeout|temporar|high demand)/i.test(message);
};

const generateWithFallback = async (
  purpose: "answer" | "links",
  prompt: string,
) => {
  const groq = getGroqClient();
  const modelsToTry = [GROQ_ANSWER_MODEL, ...GROQ_FALLBACK_MODELS];
  let lastError: unknown;

  for (const modelName of modelsToTry) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const startedAt = Date.now();

      try {
        console.log(
          `[AI][${purpose.toUpperCase()}][TRY] model=${modelName} attempt=${attempt}`,
        );
        const completion = await groq.chat.completions.create({
          model: modelName,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: 0.2,
        });
        const text = completion.choices?.[0]?.message?.content?.trim() ?? "";
        if (!text) {
          throw new Error("Groq returned an empty response");
        }
        console.log(
          `[AI][${purpose.toUpperCase()}][OK] model=${modelName} attempt=${attempt} durationMs=${Date.now() - startedAt}`,
        );
        return text;
      } catch (error) {
        lastError = error;
        const status =
          typeof error === "object" && error
            ? (error as { status?: number }).status
            : undefined;
        const message =
          error instanceof Error
            ? error.message
            : String((error as { message?: unknown }).message ?? error);
        const retryable = isRetryableError(error);

        console.error(
          `[AI][${purpose.toUpperCase()}][ERROR] model=${modelName} attempt=${attempt} retryable=${retryable} message=${truncate(normalizeText(message), 220)}`,
        );

        if (status === 404) {
          break;
        }

        if (!retryable) {
          break;
        }

        if (attempt < 3) {
          const delayMs = 500 * attempt;
          console.log(
            `[AI][${purpose.toUpperCase()}][RETRY_WAIT] model=${modelName} delayMs=${delayMs}`,
          );
          await wait(delayMs);
        }
      }
    }
  }

  if (purpose === "links") {
    return "[]";
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All AI model attempts failed");
};

export const getEmbedding = async (text: string) => {
  const cacheKey = normalizeEmbeddingKey(text).slice(0, 512);
  const cached = getCachedEmbedding(cacheKey);
  if (cached) {
    return cached;
  }

  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: EMBEDDING_MODEL,
  });
  const result = await model.embedContent(text);
  const values = result.embedding.values;
  setCachedEmbedding(cacheKey, values);
  return values.slice();
};

export const synthesizeAnswer = async (question: string, context: string) => {
  const buildFallbackAnswer = (rawContext: string) => {
    if (shouldBeShortAnswer(question)) {
      const shortAnswer = extractShortAnswerFromContext(question, rawContext);
      if (shortAnswer) return shortAnswer;
    }

    const bestLine = pickBestContextLine(question, rawContext);
    if (bestLine) {
      return stripAnswerBoilerplate(bestLine);
    }

    return "No AI answer is available right now.";
  };

  try {
    const promptContext =
      context.length > 4000 ? context.slice(0, 4000) : context;

    if (shouldBeShortAnswer(question)) {
      const deterministicAnswer = extractShortAnswerFromContext(
        question,
        context,
      );
      if (deterministicAnswer) {
        return deterministicAnswer;
      }
    }

    const prompt = `
      You are a strict factual assistant.

      User question:
      "${question}"

      Extracted website context:
      ${promptContext}

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
    `;
    const text = await generateWithFallback("answer", prompt);
    const cleaned = stripAnswerBoilerplate(text);

    if (!cleaned) {
      return buildFallbackAnswer(context);
    }

    if (shouldBeShortAnswer(question)) {
      if (isInsufficientAnswer(cleaned)) {
        const shortAnswer = extractShortAnswerFromContext(question, context);
        if (shortAnswer) return shortAnswer;
      }

      const person = extractPersonName(cleaned);
      if (person) return person;

      const firstLine = cleaned
        .split("\n")
        .find((line) => line.trim().length > 0);
      return (firstLine ?? cleaned).trim();
    }

    return cleaned;
  } catch (error) {
    console.error("Failed to synthesize answer:", error);
    return buildFallbackAnswer(context);
  }
};

export const synthesizeRelevantLinks = async (
  question: string,
  context: string,
  sources: string[],
) => {
  try {
    const prompt = `
      The user asked: "${question}"
      Extracted website data: ${context}
      Allowed links:
      ${sources.join("\n")}

      Return ONLY a JSON array of up to 3 URLs from the allowed links that are most relevant to the answer.
      Do not include any markdown, labels, or extra text.
      If none are relevant, return an empty array.
    `;

    const text = (await generateWithFallback("links", prompt)).trim();
    const jsonText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      const unique = Array.from(
        new Set(
          parsed.filter((value): value is string => typeof value === "string"),
        ),
      ).slice(0, 3);

      if (unique.length === 0) {
        return Array.from(new Set(sources)).slice(0, 1);
      }

      return unique;
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String((error as { message?: unknown }).message ?? error);
    console.error(
      `Failed to synthesize relevant links: ${truncate(normalizeText(message), 220)}`,
    );
  }

  return Array.from(new Set(sources)).slice(0, 3);
};
