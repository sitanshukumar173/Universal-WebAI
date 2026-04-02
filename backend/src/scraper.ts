import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractCompatRequest, ExtractCompatResult } from "./types.js";

let firecrawl: Firecrawl | null = null;
let genAI: GoogleGenerativeAI | null = null;

function getFirecrawl(): Firecrawl {
  if (!firecrawl) {
    if (!process.env.FIRECRAWL_KEY) {
      throw new Error("FIRECRAWL_KEY environment variable is not set");
    }
    firecrawl = new Firecrawl({
      apiKey: process.env.FIRECRAWL_KEY,
    });
  }
  return firecrawl;
}

function getGenAI(): GoogleGenerativeAI {
  if (!genAI) {
    if (!process.env.GEMINI_KEY) {
      throw new Error("GEMINI_KEY environment variable is not set");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_KEY);
  }
  return genAI;
}

export { getFirecrawl, getGenAI };

//scarap test from urls
export async function scrapeUrlCompat(
  url: string,
  request: ExtractCompatRequest,
): Promise<ExtractCompatResult> {
  try {
    const firecrawl = getFirecrawl();
    const result = await firecrawl.scrape(url, {
      formats: [
        {
          type: "json",
          prompt: request.extract.prompt,
          schema: request.extract.schema,
        },
      ],
      onlyMainContent: true,
    });

    const json = result.json as ExtractCompatResult["extract"] | undefined;
    if (json) {
      return {
        success: true,
        extract: json,
      };
    }
  } catch (err) {
    console.error(`Scrape failed for ${url}:`, err);
  }

  return { success: false };
}
