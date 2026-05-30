import { getFirecrawl } from "../scraper.js";
import { WebsiteModel, SitemapModel } from "../models.js";
import type { VectorSearchHit } from "../types.js";
import { getEmbedding } from "./ai.service.js";

type CrawlLink = {
  url: string;
  title: string;
};

const MAP_URL_LIMIT = Number(process.env.FIRECRAWL_MAP_PAGE_LIMIT || 300);
const INDEX_WORKER_COUNT = 2;

const normalizeUrl = (value: string) => {
  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return null;
    }
  }
};

const isSameSiteUrl = (value: string, domain: string) => {
  try {
    const parsed = new URL(value);
    return parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
};

const runWorkerPool = async <T>(
  items: T[],
  workerCount: number,
  worker: (item: T, workerIndex: number, itemIndex: number) => Promise<void>,
) => {
  let nextIndex = 0;
  const workers = Array.from({ length: workerCount }, (_, workerIndex) =>
    (async () => {
      while (true) {
        const itemIndex = nextIndex;
        nextIndex += 1;
        if (itemIndex >= items.length) {
          break;
        }

        await worker(items[itemIndex]!, workerIndex, itemIndex);
      }
    })(),
  );

  await Promise.all(workers);
};

const dedupeLinks = (links: CrawlLink[]) => {
  return Array.from(new Map(links.map((link) => [link.url, link])).values());
};

const tokenizeForRanking = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);

const scoreLinkForQuestion = (question: string, link: CrawlLink) => {
  const questionTokens = tokenizeForRanking(question);
  if (questionTokens.length === 0) return 0;

  const combined = `${link.title} ${link.url}`.toLowerCase();
  let score = 0;

  for (const token of questionTokens) {
    if (combined.includes(token)) {
      score += token.length >= 5 ? 3 : 1;
    }
  }

  return score;
};

export const rankLinksForQuestion = (
  question: string,
  links: CrawlLink[],
  limit = 10,
) => {
  return [...links]
    .map((link) => ({ ...link, score: scoreLinkForQuestion(question, link) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...link }) => link);
};

export const extractUrlsFromText = (text: string) => {
  const matches = text.match(/https?:\/\/[^\s"'<>]+/gi) ?? [];
  const normalized = matches
    .map((url) => url.replace(/[),.;]+$/g, ""))
    .map((url) => normalizeUrl(url))
    .filter((url): url is string => Boolean(url));

  return Array.from(new Set(normalized));
};

export const indexUrls = async (
  domain: string,
  links: CrawlLink[],
  options?: { workerCount?: number; maxUrls?: number },
) => {
  const uniqueLinks = dedupeLinks(
    links
      .map((link) => ({
        url: normalizeUrl(link.url) ?? link.url,
        title: link.title || "",
      }))
      .filter((link) => Boolean(link.url) && isSameSiteUrl(link.url, domain)),
  ).slice(0, options?.maxUrls ?? MAP_URL_LIMIT);

  if (uniqueLinks.length === 0) {
    return { total: 0, success: 0, failed: 0 };
  }

  const workerCount = Math.max(
    1,
    Math.min(options?.workerCount ?? INDEX_WORKER_COUNT, uniqueLinks.length),
  );

  let success = 0;
  let failed = 0;

  await runWorkerPool(uniqueLinks, workerCount, async (link, workerIndex) => {
    try {
      const textToEmbed = link.title || link.url.split("/").pop() || domain;
      const vector = await getEmbedding(textToEmbed, workerIndex);

      await SitemapModel.findOneAndUpdate(
        { url: link.url },
        { domain, url: link.url, title: link.title || "", embedding: vector },
        { upsert: true },
      );

      success += 1;
    } catch (error) {
      failed += 1;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[MAP][INDEX][ERROR] domain=${domain} url=${link.url} error=${errorMessage}`,
      );
    }
  });

  return { total: uniqueLinks.length, success, failed };
};

const cosineSimilarity = (left: number[], right: number[]) => {
  if (left.length === 0 || right.length === 0) return 0;

  const size = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < size; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
};

export const vectorSearchWithinUrls = async (
  questionVector: number[],
  domain: string,
  urls: string[],
  limit = 6,
): Promise<VectorSearchHit[]> => {
  const uniqueUrls = Array.from(
    new Set(
      urls
        .map((url) => normalizeUrl(url) ?? url)
        .filter(
          (url): url is string => Boolean(url) && isSameSiteUrl(url, domain),
        ),
    ),
  );

  if (uniqueUrls.length === 0) {
    return [];
  }

  const docs = (await SitemapModel.find({
    domain,
    url: { $in: uniqueUrls },
  }).lean()) as Array<{ url: string; embedding: number[] }>;

  return docs
    .map((doc) => ({
      url: doc.url,
      score: cosineSimilarity(questionVector, doc.embedding ?? []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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

export const mapNewWebsite = async (domain: string, websiteUrl: string) => {
  const startedAt = Date.now();
  console.log(`[MAP][START] domain=${domain} baseUrl=${websiteUrl}`);

  const mapAttempt = async (preference: "primary" | "secondary") => {
    const firecrawl = getFirecrawl({ preference });
    return firecrawl.map(websiteUrl, {
      sitemap: "include",
      ignoreQueryParameters: true,
      includeSubdomains: false,
      limit: MAP_URL_LIMIT,
      timeout: 120000,
    });
  };

  let mapRes;
  try {
    mapRes = await mapAttempt("primary");
  } catch (error) {
    console.warn(
      `[MAP][CRAWL][RETRY] domain=${domain} mode=secondary reason=${error instanceof Error ? error.message : String(error)}`,
    );
    mapRes = await mapAttempt("secondary");
  }

  const rawCount = mapRes.links?.length ?? 0;
  console.log(`[MAP][CRAWL] domain=${domain} discoveredLinks=${rawCount}`);

  if (!mapRes.links || mapRes.links.length === 0) {
    const elapsedMs = Date.now() - startedAt;
    console.warn(
      `[MAP][DONE] domain=${domain} status=no-links total=0 success=0 failed=0 durationMs=${elapsedMs}`,
    );
    return;
  }

  const normalizedLinks: CrawlLink[] = mapRes.links
    .map((item: any) => {
      if (typeof item === "string") {
        return { url: item, title: "" };
      }

      if (item && typeof item.url === "string") {
        return {
          url: item.url,
          title: typeof item.title === "string" ? item.title : "",
        };
      }

      return null;
    })
    .filter((item): item is CrawlLink => Boolean(item?.url));

  const uniqueLinks = dedupeLinks(normalizedLinks).slice(0, MAP_URL_LIMIT);
  console.log(
    `[MAP][CRAWL] domain=${domain} uniqueLinks=${uniqueLinks.length}`,
  );

  const indexResult = await indexUrls(domain, uniqueLinks, {
    workerCount: INDEX_WORKER_COUNT,
    maxUrls: MAP_URL_LIMIT,
  });

  await WebsiteModel.updateOne(
    { domain },
    { isMapped: true },
    { upsert: true },
  );

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[MAP][DONE] domain=${domain} total=${indexResult.total} success=${indexResult.success} failed=${indexResult.failed} durationMs=${elapsedMs}`,
  );
};

export const vectorSearch = async (
  questionVector: number[],
  domain: string,
): Promise<VectorSearchHit[]> => {
  return await SitemapModel.aggregate<VectorSearchHit>([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: questionVector,
        filter: { domain },
        numCandidates: 50,
        limit: 1,
      },
    },
    { $project: { url: 1, domain: 1, score: { $meta: "vectorSearchScore" } } },
    { $match: { domain } },
  ]);
};
