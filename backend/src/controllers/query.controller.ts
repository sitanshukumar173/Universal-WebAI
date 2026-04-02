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

//main ai query/chat route
export const handleQuery = async (req: Request, res: Response) => {
  try {
    const { question, websiteUrl } = req.body as {
      question: string;
      websiteUrl: string;
    };
    const domain = new URL(websiteUrl).hostname;

    //serches in database is website already exist or not
    const siteExists = await WebsiteModel.findOne({ domain });
    if (!siteExists) await mapNewWebsite(domain, websiteUrl); //if website not exist then run  mapNewWebsite(domain, websiteUrl) to scrap all links and save in db

    //makes embedding of question and serch in db
    const questionVector = await getEmbedding(question);
    const candidateLinks = await vectorSearch(questionVector, domain);
    //if relevrnt link have low score(<0.7/70%) then Fallback
    let targetUrls: string[] = candidateLinks
      .filter((l: VectorSearchHit) => l.score > 0.7)
      .map((l: VectorSearchHit) => l.url);

    // fallback - does does direct brout forch serch on that domain with asked question to gettargetUrls
    if (targetUrls.length === 0) {
      const firecrawl = getFirecrawl();
      const search = await firecrawl.search(`${domain} ${question}`, {
        limit: 2,
      });
      targetUrls = (search.web as Array<{ url?: string | null }> | undefined)
        ?.map((r: { url?: string | null }) => r.url)
        .filter((url): url is string => Boolean(url)) ?? [websiteUrl];
    }

    const sources = Array.from(new Set(targetUrls));

    //actual text extraction from urls
    const extractionPromises = sources.map(async (url: string) => {
      //if text extraction takes more tehn 30s then timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 30000),
      );

      //actual text scrapper function call
      const scrapeJob = scrapeUrlCompat(url, {
        formats: ["extract"],
        extract: {
          prompt: `Answer: ${question}`,
          schema: {
            type: "object",
            properties: {
              answer: { type: "string" },
              found_in_pdf: { type: "boolean" },
            },
            required: ["answer"],
          },
        },
      });

      return Promise.race([scrapeJob, timeout]).catch(() => ({
        success: false,
      })) as Promise<ExtractCompatResult>;
    });

    const results = (await Promise.all(extractionPromises)).filter(
      (r) => r.success,
    );
    if (results.length === 0)
      return res.status(404).json({ message: "No info found" });

    // Synthesis the extracted text(context)+question with ai to give proper ansewr
    const context = results.map((r) => r.extract?.answer).join("\n---\n");
    const answer = await synthesizeAnswer(question, context);
    const relevantLinks = await synthesizeRelevantLinks(
      question,
      context,
      sources,
    );

    return res.status(200).json({ answer, sources, relevantLinks });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};
