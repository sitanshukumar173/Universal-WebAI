import type { Request, Response } from "express";
import { WebsiteModel } from "../models.js";
import { getFirecrawl, scrapeUrlCompat } from "../scraper.js";
import {
  getEmbedding,
  synthesizeAnswer,
  synthesizeRelevantLinks,
} from "../services/ai.service.js";
import type { ExtractCompatResult, VectorSearchHit } from "../types.js";
import { mapNewWebsite, vectorSearch } from "../services/web.service.js";

const mappingInProgress = new Set<string>();

// Normalize URL input to a usable absolute URL.
// Adds https:// if protocol is missing.
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

// Create a safe base URL (origin/) from any valid URL input.
const toBaseUrl = (url: string): string => {
  const parsed = new URL(url);
  return `${parsed.origin}/`;
};

//main ai query/chat route
export const handleQuery = async (req: Request, res: Response) => {
  const requestStartedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    const { question, websiteUrl, currentPageUrl, baseUrl } = req.body as {
      question: string;
      websiteUrl: string;
      currentPageUrl?: string;
      baseUrl?: string;
    };

    // Backward compatible behavior:
    // - `websiteUrl` can still be sent by old clients.
    // - New clients can send both `currentPageUrl` and `baseUrl`.
    const normalizedCurrentUrl =
      normalizeUrlInput(currentPageUrl) ?? normalizeUrlInput(websiteUrl);
    const normalizedBaseUrl =
      normalizeUrlInput(baseUrl) ??
      (normalizedCurrentUrl ? toBaseUrl(normalizedCurrentUrl) : null);

    if (!normalizedCurrentUrl || !normalizedBaseUrl) {
      console.warn(
        `[QUERY][${requestId}][INVALID_INPUT] questionPresent=${Boolean(question)} current=${Boolean(normalizedCurrentUrl)} base=${Boolean(normalizedBaseUrl)}`,
      );
      return res.status(400).json({
        message: "Invalid URL input. Please provide a valid current/base URL.",
      });
    }

    // Domain should always come from the base site URL.
    // This keeps domain mapping/search consistent for subpages.
    const domain = new URL(normalizedBaseUrl).hostname;
    console.log(
      `[QUERY][${requestId}][START] domain=${domain} currentUrl=${normalizedCurrentUrl} baseUrl=${normalizedBaseUrl}`,
    );

    //serches in database is website already exist or not
    const siteExists = await WebsiteModel.findOne({ domain });

    // Start full-site mapping in background for first-time domains so the first
    // query does not block until every page is crawled + embedded.
    if (!siteExists?.isMapped && !mappingInProgress.has(domain)) {
      mappingInProgress.add(domain);

      // Create a placeholder entry immediately to avoid duplicate concurrent mapping starts.
      await WebsiteModel.updateOne(
        { domain },
        { domain, isMapped: false },
        { upsert: true },
      );

      console.log(
        `[QUERY][${requestId}][MAP] domain=${domain} mode=background status=started`,
      );

      void mapNewWebsite(domain, normalizedBaseUrl)
        .then(() => {
          console.log(
            `[QUERY][${requestId}][MAP] domain=${domain} mode=background status=completed`,
          );
        })
        .catch((err) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          console.error(
            `[QUERY][${requestId}][MAP] domain=${domain} mode=background status=failed error=${errorMessage}`,
          );
        })
        .finally(() => {
          mappingInProgress.delete(domain);
        });
    }

    //makes embedding of question and serch in db
    const embeddingStartedAt = Date.now();
    const questionVector = await getEmbedding(question);
    console.log(
      `[QUERY][${requestId}][EMBEDDING] durationMs=${Date.now() - embeddingStartedAt}`,
    );

    const vectorStartedAt = Date.now();
    const candidateLinks = await vectorSearch(questionVector, domain);
    console.log(
      `[QUERY][${requestId}][VECTOR] candidates=${candidateLinks.length} durationMs=${Date.now() - vectorStartedAt}`,
    );

    //if relevrnt link have low score(<0.7/70%) then Fallback
    let targetUrls: string[] = candidateLinks
      .filter((l: VectorSearchHit) => l.score > 0.7)
      .map((l: VectorSearchHit) => l.url);

    // Fallback search if vector hits are weak.
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

    // Priority order requested:
    // 1) Current page URL first
    // 2) Base URL second
    // 3) Other discovered/vector URLs after that
    // If current and base are same, Set keeps it only once.
    const sources = Array.from(
      new Set([normalizedCurrentUrl, normalizedBaseUrl, ...targetUrls]),
    );
    console.log(`[QUERY][${requestId}][SOURCES] total=${sources.length}`);

    //actual text extraction from urls
    const extractionStartedAt = Date.now();
    const extractionPromises = sources.map(async (url: string) => {
      //if text extraction takes more tehn 30s then timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 30000),
      );

      //actual text scrapper function call
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

      return Promise.race([scrapeJob, timeout]).catch((err) => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(
          `[QUERY][${requestId}][EXTRACT][ERROR] url=${url} error=${errorMessage}`,
        );
        return {
          success: false,
        };
      }) as Promise<ExtractCompatResult>;
    });

    const results = (await Promise.all(extractionPromises)).filter(
      (r) => r.success,
    );
    console.log(
      `[QUERY][${requestId}][EXTRACT] success=${results.length}/${sources.length} durationMs=${Date.now() - extractionStartedAt}`,
    );

    if (results.length === 0)
      return res.status(404).json({ message: "No info found" });

    // Synthesis the extracted text(context)+question with ai to give proper ansewr
    const context = results
      .map((r) => {
        const answer =
          typeof r.extract?.answer === "string" ? r.extract.answer.trim() : "";
        const details =
          typeof r.extract?.details === "string"
            ? r.extract.details.trim()
            : "";
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
    const relevantLinks = await synthesizeRelevantLinks(
      question,
      context,
      sources,
    );
    console.log(
      `[QUERY][${requestId}][RELEVANT_LINKS] count=${relevantLinks.length} durationMs=${Date.now() - linksStartedAt}`,
    );

    console.log(
      `[QUERY][${requestId}][DONE] status=200 totalDurationMs=${Date.now() - requestStartedAt}`,
    );

    return res.status(200).json({ answer, sources, relevantLinks });
  } catch (error: any) {
    console.error(
      `[QUERY][${requestId}][FAILED] totalDurationMs=${Date.now() - requestStartedAt} error=${error?.message ?? String(error)}`,
    );
    res.status(500).json({ error: error.message });
  }
};
