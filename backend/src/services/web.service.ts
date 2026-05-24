import { getFirecrawl } from "../scraper.js";
import { WebsiteModel, SitemapModel } from "../models.js";
import type { VectorSearchHit } from "../types.js";
import { getEmbedding } from "./ai.service.js";

type CrawlLink = {
  url: string;
  title: string;
};

export const mapNewWebsite = async (domain: string, websiteUrl: string) => {
  const startedAt = Date.now();
  console.log(`[MAP][START] domain=${domain} baseUrl=${websiteUrl}`);

  const firecrawl = getFirecrawl();
  const mapRes = await firecrawl.map(websiteUrl, {
    sitemap: "include",
  });

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

  const uniqueLinks = Array.from(
    new Map(normalizedLinks.map((l) => [l.url, l])).values(),
  );
  console.log(
    `[MAP][CRAWL] domain=${domain} uniqueLinks=${uniqueLinks.length}`,
  );

  let processed = 0;
  let success = 0;
  let failed = 0;
  const total = uniqueLinks.length;
  const errorBuckets: Record<string, number> = {};

  const mapPromises = uniqueLinks.map(
    async (link: CrawlLink, index: number) => {
      const url = link.url;

      if (!url) {
        failed += 1;
        processed += 1;
        console.warn(
          `[MAP][SKIP] domain=${domain} index=${index + 1}/${total} reason=missing-url progress=${processed}/${total}`,
        );
        return null;
      }

      try {
        const textToEmbed = link.title || url.split("/").pop() || domain;
        const vector = await getEmbedding(textToEmbed);

        const result = await SitemapModel.findOneAndUpdate(
          { url },
          { domain, url, title: link.title || "", embedding: vector },
          { upsert: true },
        );

        success += 1;
        processed += 1;
        console.log(
          `[MAP][OK] domain=${domain} index=${index + 1}/${total} progress=${processed}/${total} url=${url}`,
        );

        return result;
      } catch (err) {
        failed += 1;
        processed += 1;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorKey = errorMessage.slice(0, 120) || "unknown-error";
        errorBuckets[errorKey] = (errorBuckets[errorKey] ?? 0) + 1;
        console.error(
          `[MAP][ERROR] domain=${domain} index=${index + 1}/${total} progress=${processed}/${total} url=${url} error=${errorMessage}`,
        );
        return null;
      }
    },
  );

  await Promise.all(mapPromises);

  await WebsiteModel.updateOne(
    { domain },
    { isMapped: true },
    { upsert: true },
  );

  const elapsedMs = Date.now() - startedAt;
  console.log(
    `[MAP][DONE] domain=${domain} total=${total} success=${success} failed=${failed} durationMs=${elapsedMs}`,
  );

  if (failed > 0) {
    const errorSummary = Object.entries(errorBuckets)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => `${count}x ${message}`)
      .join(" | ");

    console.warn(
      `[MAP][ERROR_SUMMARY] domain=${domain} topErrors=${errorSummary}`,
    );
  }
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
        numCandidates: 50,
        limit: 1,
      },
    },
    { $project: { url: 1, domain: 1, score: { $meta: "vectorSearchScore" } } },
    { $match: { domain } },
  ]);
};
