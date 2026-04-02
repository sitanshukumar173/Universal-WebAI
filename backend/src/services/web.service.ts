import { getFirecrawl } from "../scraper.js";
import { WebsiteModel, SitemapModel } from "../models.js";
import type { VectorSearchHit } from "../types.js";
import { getEmbedding } from "./ai.service.js";

//map all url of website and save in db with its embeddings
export const mapNewWebsite = async (domain: string, websiteUrl: string) => {
  console.log(` Mapping Domain: ${domain}`);
  const firecrawl = getFirecrawl();
  const mapRes = await firecrawl.map(websiteUrl, {
    limit: 50, //limito to map only top 50 url's
    sitemap: "include",
  });

  if (!mapRes.links || mapRes.links.length === 0) return;

  const uniqueLinks = Array.from(
    new Map(mapRes.links.map((l: any) => [l.url, l])).values(),
  );

  const mapPromises = uniqueLinks.map(async (link: any) => {
    try {
      const textToEmbed = link.title || link.url.split("/").pop() || domain;
      const vector = await getEmbedding(textToEmbed);

      return SitemapModel.findOneAndUpdate(
        { url: link.url },
        { domain, url: link.url, title: link.title || "", embedding: vector },
        { upsert: true },
      );
    } catch (err) {
      return null;
    }
  });

  await Promise.all(mapPromises);
  await WebsiteModel.create({ domain, isMapped: true }); //create website entry in db - so we can check later is this alredy mapped or not
};

//vector serch for question asked to find top- 1 relevent link
export const vectorSearch = async (
  questionVector: number[],
): Promise<VectorSearchHit[]> => {
  return await SitemapModel.aggregate<VectorSearchHit>([
    {
      $vectorSearch: {
        index: "vector_index",
        path: "embedding",
        queryVector: questionVector,
        numCandidates: 50,
        limit: 1, //give- 1 most relevnt url
      },
    },
    { $project: { url: 1, score: { $meta: "vectorSearchScore" } } },
  ]);
};
