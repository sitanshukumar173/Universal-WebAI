import type { Request, Response } from "express";
import { WebsiteModel } from "../models.js";
import { getFirecrawl, scrapeUrlCompat } from "../scraper.js";
import { getEmbedding, synthesizeAnswer } from "../services/ai.service.js";
import type { ExtractCompatResult, VectorSearchHit } from "../types.js";
import { mapNewWebsite, vectorSearch } from "../services/web.service.js";

const mappingInProgress = new Set<string>();
const mappingJobs = new Map<string, Promise<void>>();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const MAPPING_WAIT_BUDGET_MS = 2000;
const ANSWER_CACHE_TTL_MS = 10 * 60 * 1000;
const EXTRACT_CACHE_TTL_MS = 5 * 60 * 1000;
const WARMUP_CACHE_TTL_MS = 15 * 60 * 1000;

const normalizeUrlInput = (value?: string): string | null => {
  if (!value || !value.trim()) return null;
  const raw = value.trim();

  try {
    return new URL(raw).toString();
  } catch {
    try {
      return new URL(`https://${raw}`).toString();
    } catch {
      return null;
    }
  }
};

const toBaseUrl = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}/`;
};

type QueryPayload = {
  question: string;
  websiteUrl: string;
  currentPageUrl?: string;
  baseUrl?: string;
};

type QueryProgressCallback = (event: {
  type: "stage" | "answer_chunk" | "result" | "error";
  data: unknown;
}) => void;

type ExtractedSource = {
  url: string;
  extract?: ExtractCompatResult["extract"];
};

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type QueryResult = {
  answer: string;
  sources: string[];
  relevantLinks: string[];
};

const isTimeoutLikeError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? error ?? "");

  return /timeout|timed out|aborted|network|fetch/i.test(message);
};

const isEmbeddingQuotaError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown })?.message ?? error ?? "");

  return /quota exceeded|too many requests|429|embed_content_free_tier_requests|gemini-embedding/i.test(
    message,
  );
};

const buildNoEvidenceFallback = (
  question: string,
  normalizedCurrentUrl: string,
  normalizedBaseUrl: string,
  sources: string[],
): QueryResult => {
  const hasQuestion =
    typeof question === "string" && question.trim().length > 0;
  const answer = hasQuestion
    ? "I am still mapping this website and could not gather enough evidence yet. Please wait a few seconds and ask again."
    : "I am still mapping this website. Please wait a few seconds and ask again.";

  const fallbackLinks = Array.from(
    new Set([normalizedCurrentUrl, normalizedBaseUrl, ...sources]),
  ).slice(0, 3);

  return {
    answer,
    sources,
    relevantLinks: fallbackLinks,
  };
};

const buildTimeoutFallbackFromPayload = (
  payload: QueryPayload,
): QueryResult => {
  const normalizedCurrentUrl =
    normalizeUrlInput(payload.currentPageUrl) ??
    normalizeUrlInput(payload.websiteUrl) ??
    "https://example.com/";

  const normalizedBaseUrl =
    normalizeUrlInput(payload.baseUrl) ?? toBaseUrl(normalizedCurrentUrl);

  return buildNoEvidenceFallback(
    payload.question,
    normalizedCurrentUrl,
    normalizedBaseUrl,
    [normalizedCurrentUrl, normalizedBaseUrl],
  );
};

const answerCache = new Map<string, CacheEntry<QueryResult>>();
const extractCache = new Map<string, CacheEntry<ExtractedSource>>();
const warmupCache = new Map<string, CacheEntry<true>>();

const normalizeForMatch = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenizeForMatch = (value: string) =>
  normalizeForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length > 2);

const getCachedValue = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | null => {
  const hit = cache.get(key);
  if (!hit) return null;

  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return hit.value;
};

const setCachedValue = <T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttlMs: number,
) => {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
};

const scoreSourceForAnswer = (answer: string, sourceText: string) => {
  const normalizedAnswer = normalizeForMatch(answer);
  const normalizedSource = normalizeForMatch(sourceText);

  if (!normalizedAnswer || !normalizedSource) return 0;
  if (normalizedSource.includes(normalizedAnswer)) {
    return 1000 + normalizedAnswer.length;
  }

  const answerTokens = tokenizeForMatch(answer);
  if (answerTokens.length === 0) return 0;

  const sourceTokens = new Set(tokenizeForMatch(sourceText));
  let score = 0;

  for (const token of answerTokens) {
    if (sourceTokens.has(token)) {
      score += token.length >= 6 ? 3 : 1;
    }
  }

  return score + Math.min(answerTokens.length, 5);
};

const selectAnswerSourceLinks = (
  answer: string,
  sources: ExtractedSource[],
  limit = 3,
) => {
  const isHomePageUrl = (value: string) => {
    try {
      const parsed = new URL(value);
      return parsed.pathname === "/" && !parsed.search && !parsed.hash;
    } catch {
      return false;
    }
  };

  const ranked = sources
    .map((source) => {
      const sourceText = [source.extract?.answer, source.extract?.details]
        .filter(
          (part): part is string =>
            typeof part === "string" && Boolean(part.trim()),
        )
        .join("\n");

      return {
        url: source.url,
        score: scoreSourceForAnswer(answer, sourceText),
      };
    })
    .sort((a, b) => b.score - a.score);

  const bestMatches = ranked.filter((item) => item.score > 0).slice(0, limit);
  const uniqueLinks = Array.from(new Set(bestMatches.map((item) => item.url)));

  if (uniqueLinks.length === 0) {
    const fallbackLinks = Array.from(
      new Set(sources.map((source) => source.url)),
    );
    if (fallbackLinks.length <= 1) {
      return fallbackLinks.slice(0, 1);
    }

    const nonHomeFallbackLinks = fallbackLinks.filter(
      (url) => !isHomePageUrl(url),
    );
    return (
      nonHomeFallbackLinks.length > 0
        ? nonHomeFallbackLinks
        : fallbackLinks.slice(0, 1)
    ).slice(0, limit);
  }

  if (uniqueLinks.length <= 1) {
    return uniqueLinks;
  }

  const nonHomeLinks = uniqueLinks.filter((url) => !isHomePageUrl(url));
  return (nonHomeLinks.length > 0 ? nonHomeLinks : uniqueLinks).slice(0, limit);
};

const createMappingJob = (
  domain: string,
  normalizedBaseUrl: string,
  requestId: string,
  reason: "warmup" | "query",
) => {
  const existingJob = mappingJobs.get(domain);
  if (existingJob) {
    console.log(
      `[QUERY][${requestId}][MAP] domain=${domain} reason=${reason} mode=queued status=join-existing`,
    );
    return existingJob;
  }

  const job = (async () => {
    const siteExists = await WebsiteModel.findOne({ domain });
    if (siteExists?.isMapped) {
      console.log(
        `[QUERY][${requestId}][MAP] domain=${domain} reason=${reason} mode=queued status=already-mapped`,
      );
      return;
    }

    await WebsiteModel.updateOne(
      { domain },
      { domain, isMapped: false },
      { upsert: true },
    );

    console.log(
      `[QUERY][${requestId}][MAP] domain=${domain} reason=${reason} mode=queued status=started`,
    );

    await mapNewWebsite(domain, normalizedBaseUrl);

    console.log(
      `[QUERY][${requestId}][MAP] domain=${domain} reason=${reason} mode=queued status=completed`,
    );

    setCachedValue(warmupCache, domain, true, WARMUP_CACHE_TTL_MS);
  })().finally(() => {
    mappingJobs.delete(domain);
  });

  mappingJobs.set(domain, job);
  return job;
};

const emitSseEvent = (
  res: Response,
  event: "stage" | "answer_chunk" | "result" | "error",
  data: unknown,
) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
};

const streamAnswer = async (
  res: Response,
  answer: string,
  emit?: QueryProgressCallback,
) => {
  const chunks = answer.match(/.{1,24}(?:\s|$)/g) ?? [answer];
  console.log(`[STREAM][ANSWER] chunkCount=${chunks.length}`);

  for (const chunk of chunks) {
    emit?.({ type: "answer_chunk", data: { chunk } });
    if (res.writableEnded) break;
    await delay(18);
  }

  console.log("[STREAM][ANSWER] completed");
};

const getWarmupReadyState = async (domain: string) => {
  const cachedWarmup = getCachedValue(warmupCache, domain);
  if (cachedWarmup) {
    console.log(`[WARMUP][STATE] domain=${domain} source=cache ready=true`);
    return true;
  }

  const siteExists = await WebsiteModel.findOne({ domain });
  if (siteExists?.isMapped) {
    setCachedValue(warmupCache, domain, true, WARMUP_CACHE_TTL_MS);
    console.log(`[WARMUP][STATE] domain=${domain} source=db ready=true`);
    return true;
  }

  console.log(`[WARMUP][STATE] domain=${domain} source=db ready=false`);

  return false;
};

const runQueryPipeline = async (
  payload: QueryPayload,
  requestId: string,
  emit?: QueryProgressCallback,
) => {
  const { question, websiteUrl, currentPageUrl, baseUrl } = payload;

  const normalizedCurrentUrl =
    normalizeUrlInput(currentPageUrl) ?? normalizeUrlInput(websiteUrl);
  const normalizedBaseUrl =
    normalizeUrlInput(baseUrl) ??
    (normalizedCurrentUrl ? toBaseUrl(normalizedCurrentUrl) : null);

  if (!normalizedCurrentUrl || !normalizedBaseUrl) {
    throw new Error(
      "Invalid URL input. Please provide a valid current/base URL.",
    );
  }

  const domain = new URL(normalizedBaseUrl).hostname;
  const normalizedQuestion = normalizeForMatch(question);
  const answerCacheKey = `${domain}::${normalizedQuestion}`;

  console.log(
    `[QUERY][${requestId}][INPUT] domain=${domain} questionChars=${question.length}`,
  );

  const cachedAnswer = getCachedValue(answerCache, answerCacheKey);
  if (cachedAnswer) {
    console.log(
      `[QUERY][${requestId}][CACHE_HIT] type=answer domain=${domain}`,
    );
    emit?.({
      type: "stage",
      data: { message: "Serving cached result ...", phase: "cache" },
    });
    return cachedAnswer;
  }

  console.log(
    `[QUERY][${requestId}][START] domain=${domain} currentUrl=${normalizedCurrentUrl} baseUrl=${normalizedBaseUrl}`,
  );

  const warmupReady = await getWarmupReadyState(domain);
  console.log(`[QUERY][${requestId}][WARMUP] ready=${warmupReady}`);

  if (!warmupReady) {
    emit?.({
      type: "stage",
      data: { message: "Scanning page layout ...", phase: "mapping" },
    });

    mappingInProgress.add(domain);
    try {
      console.log(
        `[QUERY][${requestId}][MAP_WAIT] budgetMs=${MAPPING_WAIT_BUDGET_MS} status=started`,
      );
      await Promise.race([
        createMappingJob(domain, normalizedBaseUrl, requestId, "query"),
        delay(MAPPING_WAIT_BUDGET_MS),
      ]);
      console.log(`[QUERY][${requestId}][MAP_WAIT] status=ended`);
    } finally {
      mappingInProgress.delete(domain);
    }
  }

  emit?.({
    type: "stage",
    data: { message: "Gathering evidence ...", phase: "evidence" },
  });

  let candidateLinks: VectorSearchHit[] = [];
  try {
    const embeddingStartedAt = Date.now();
    const questionVector = await getEmbedding(question);
    console.log(
      `[QUERY][${requestId}][EMBEDDING] durationMs=${Date.now() - embeddingStartedAt}`,
    );

    const vectorStartedAt = Date.now();
    candidateLinks = await vectorSearch(questionVector, domain);
    console.log(
      `[QUERY][${requestId}][VECTOR] candidates=${candidateLinks.length} durationMs=${Date.now() - vectorStartedAt}`,
    );
  } catch (error: unknown) {
    if (isEmbeddingQuotaError(error)) {
      const quotaMessage =
        error instanceof Error ? error.message : String(error ?? "unknown");
      console.warn(
        `[QUERY][${requestId}][EMBEDDING_QUOTA] fallback=direct-search message=${quotaMessage}`,
      );
      emit?.({
        type: "stage",
        data: {
          message:
            "Embedding quota reached, switching to direct site search ...",
          phase: "fallback",
        },
      });
    } else {
      throw error;
    }
  }

  let targetUrls: string[] = candidateLinks
    .filter((l: VectorSearchHit) => l.score > 0.7)
    .map((l: VectorSearchHit) => l.url);

  if (targetUrls.length === 0) {
    const fallbackStartedAt = Date.now();
    const firecrawl = getFirecrawl();
    const search = await firecrawl.search(`${domain} ${question}`, {
      limit: 2,
    });
    targetUrls = (search.web as Array<{ url?: string | null }> | undefined)
      ?.map((r: { url?: string | null }) => r.url)
      .filter((url): url is string => Boolean(url)) ?? [normalizedCurrentUrl];
    console.log(
      `[QUERY][${requestId}][FALLBACK] urls=${targetUrls.length} durationMs=${Date.now() - fallbackStartedAt}`,
    );
  }

  const sources = Array.from(
    new Set([normalizedCurrentUrl, normalizedBaseUrl, ...targetUrls]),
  );

  console.log(`[QUERY][${requestId}][SOURCES] total=${sources.length}`);

  const extractionStartedAt = Date.now();
  const extractionPromises = sources.map(async (url: string) => {
    const extractCacheKey = `${domain}::${normalizedQuestion}::${url}`;
    const cachedExtract = getCachedValue(extractCache, extractCacheKey);
    if (cachedExtract) {
      console.log(`[QUERY][${requestId}][EXTRACT][CACHE_HIT] url=${url}`);
      return {
        success: true,
        url,
        extract: cachedExtract.extract,
      };
    }

    console.log(`[QUERY][${requestId}][EXTRACT][START] url=${url}`);

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 30000),
    );

    const scrapeJob = scrapeUrlCompat(url, {
      formats: ["extract"],
      extract: {
        prompt: `Question: ${question}
Extract the most precise factual answer from this page.
If the question asks for a designation holder (for example director/dean/HOD), return the exact person name tied to that designation.
Also include one short supporting line copied from the page where the answer appears.
Prefer exact names, numbers, and dates from the page text.
Do not add explanation.`,
        schema: {
          type: "object",
          properties: {
            answer: { type: "string" },
            details: { type: "string" },
            found_in_pdf: { type: "boolean" },
          },
          required: ["answer"],
        },
      },
    });

    return Promise.race([scrapeJob, timeout])
      .then((result) => {
        const scrapedResult = result as ExtractCompatResult | undefined;

        return {
          success: Boolean(scrapedResult?.success),
          url,
          extract: scrapedResult?.extract,
        };
      })
      .then((result) => {
        if (result.success) {
          setCachedValue(
            extractCache,
            extractCacheKey,
            { url, extract: result.extract },
            EXTRACT_CACHE_TTL_MS,
          );
          console.log(`[QUERY][${requestId}][EXTRACT][OK] url=${url}`);
        }
        return result;
      })
      .catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `[QUERY][${requestId}][EXTRACT][ERROR] url=${url} error=${errorMessage}`,
        );
        return {
          success: false,
          url,
        };
      });
  });

  const results = (await Promise.all(extractionPromises)).filter(
    (result): result is ExtractedSource & { success: true } => result.success,
  );
  console.log(
    `[QUERY][${requestId}][EXTRACT] success=${results.length}/${sources.length} durationMs=${Date.now() - extractionStartedAt}`,
  );

  if (results.length === 0) {
    console.warn(
      `[QUERY][${requestId}][NO_EVIDENCE] domain=${domain} sources=${sources.length} action=fallback-response`,
    );
    emit?.({
      type: "stage",
      data: {
        message: "Still mapping this site, preparing fallback response ...",
        phase: "fallback",
      },
    });

    return buildNoEvidenceFallback(
      question,
      normalizedCurrentUrl,
      normalizedBaseUrl,
      sources,
    );
  }

  emit?.({
    type: "stage",
    data: { message: "Generating AI summary ...", phase: "answer" },
  });

  const context = results
    .map((r) => {
      const answer =
        typeof r.extract?.answer === "string" ? r.extract.answer.trim() : "";
      const details =
        typeof r.extract?.details === "string" ? r.extract.details.trim() : "";
      return [answer, details].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n---\n");

  const answerStartedAt = Date.now();
  const answer = await synthesizeAnswer(question, context);
  console.log(
    `[QUERY][${requestId}][ANSWER] durationMs=${Date.now() - answerStartedAt}`,
  );

  const linksStartedAt = Date.now();
  const relevantLinks = selectAnswerSourceLinks(answer, results);
  console.log(
    `[QUERY][${requestId}][RELEVANT_LINKS] count=${relevantLinks.length} durationMs=${Date.now() - linksStartedAt}`,
  );

  const response: QueryResult = {
    answer,
    sources,
    relevantLinks,
  };

  setCachedValue(answerCache, answerCacheKey, response, ANSWER_CACHE_TTL_MS);

  return response;
};

export const handleQuery = async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const result = await runQueryPipeline(req.body as QueryPayload, requestId);

    console.log(
      `[QUERY][${requestId}][DONE] status=200 totalDurationMs=${Date.now() - requestStartedAt}`,
    );

    return res.status(200).json(result);
  } catch (error: any) {
    if (error?.message === "No info found") {
      return res.status(404).json({ message: "No info found" });
    }

    console.error(
      `[QUERY][${requestId}][FAILED] totalDurationMs=${Date.now() - requestStartedAt} error=${error?.message ?? String(error)}`,
    );
    res.status(500).json({ error: error.message });
  }
};

export const handleWarmup = async (req: Request, res: Response) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[WARMUP][${requestId}][START]`);

  try {
    const { websiteUrl, currentPageUrl, baseUrl } = req.body as QueryPayload;
    const normalizedCurrentUrl =
      normalizeUrlInput(currentPageUrl) ?? normalizeUrlInput(websiteUrl);
    const normalizedBaseUrl =
      normalizeUrlInput(baseUrl) ??
      (normalizedCurrentUrl ? toBaseUrl(normalizedCurrentUrl) : null);

    if (!normalizedCurrentUrl || !normalizedBaseUrl) {
      console.warn(`[WARMUP][${requestId}][INVALID_URL]`);
      return res.status(400).json({
        message: "Invalid URL input. Please provide a valid current/base URL.",
      });
    }

    const domain = new URL(normalizedBaseUrl).hostname;
    const siteExists = await WebsiteModel.findOne({ domain });

    if (siteExists?.isMapped) {
      setCachedValue(warmupCache, domain, true, WARMUP_CACHE_TTL_MS);

      console.log(`[WARMUP][${requestId}][DONE] domain=${domain} status=ready`);

      return res.status(200).json({
        status: "ready",
        domain,
        message: "Website mapping is already complete.",
      });
    }

    void createMappingJob(domain, normalizedBaseUrl, requestId, "warmup").catch(
      (error) => {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[QUERY][${requestId}][WARMUP][FAILED] domain=${domain} error=${errorMessage}`,
        );
      },
    );

    return res.status(202).json({
      status: mappingJobs.has(domain) ? "queued" : "started",
      domain,
      message: "Website mapping has started.",
    });
  } catch (error: any) {
    console.error(
      `[WARMUP][${requestId}][FAILED] error=${error?.message ?? String(error)}`,
    );
    return res.status(500).json({ error: error.message });
  }
};

export const handleQueryStream = async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  console.log(`[STREAM][${requestId}][START]`);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (
    event: "stage" | "answer_chunk" | "result" | "error",
    data: unknown,
  ) => {
    if (res.writableEnded) return;
    emitSseEvent(res, event, data);
  };

  const emit: QueryProgressCallback = (event) => {
    if (event.type === "stage") {
      const message =
        typeof event.data === "object" &&
        event.data &&
        typeof (event.data as { message?: unknown }).message === "string"
          ? (event.data as { message: string }).message
          : "unknown-stage";
      console.log(`[QUERY][${requestId}][STAGE] ${message}`);
    }

    send(event.type, event.data);
  };

  const keepAlive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`: ping\n\n`);
    }
  }, 15000);

  try {
    const result = await runQueryPipeline(
      req.body as QueryPayload,
      requestId,
      emit,
    );
    await streamAnswer(res, result.answer, emit);
    send("result", result);
    console.log(
      `[STREAM][${requestId}][RESULT] links=${result.relevantLinks.length} answerChars=${result.answer.length}`,
    );
    console.log(
      `[QUERY][${requestId}][DONE] status=200 totalDurationMs=${Date.now() - requestStartedAt}`,
    );
    res.end();
  } catch (error: any) {
    const message = error?.message ?? String(error);

    if (isEmbeddingQuotaError(error)) {
      console.warn(
        `[STREAM][${requestId}][RECOVERED_EMBEDDING_QUOTA] message=${message}`,
      );
      send("stage", {
        message:
          "Embedding quota reached, returning a fallback response using direct search ...",
        phase: "fallback",
      });
      send("result", buildTimeoutFallbackFromPayload(req.body as QueryPayload));
      res.end();
      return;
    }

    if (isTimeoutLikeError(error)) {
      console.warn(
        `[STREAM][${requestId}][RECOVERED_TIMEOUT] message=${message}`,
      );
      send("stage", {
        message:
          "This is taking longer than expected. Returning a fallback response ...",
        phase: "fallback",
      });
      send("result", buildTimeoutFallbackFromPayload(req.body as QueryPayload));
      res.end();
      return;
    }

    send("error", { message });
    console.error(
      `[QUERY][${requestId}][FAILED] totalDurationMs=${Date.now() - requestStartedAt} error=${message}`,
    );
    res.end();
  } finally {
    clearInterval(keepAlive);
    console.log(
      `[STREAM][${requestId}][END] totalDurationMs=${Date.now() - requestStartedAt}`,
    );
  }
};
