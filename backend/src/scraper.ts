import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractCompatRequest, ExtractCompatResult } from "./types.js";

let firecrawl: Firecrawl | null = null;
let genAI: GoogleGenerativeAI | null = null;

const normalizeWhitespace = (value: string) =>
  value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ");

const pickMarkdownSnippet = (markdown: string) => {
  const normalized = normalizeWhitespace(markdown);
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 2);

  const roleLine = lines.find((line) =>
    /(director|dean|hod|head|chairperson|principal|registrar|vice chancellor|dr\.|prof\.)/i.test(
      line,
    ),
  );

  if (roleLine) {
    return roleLine.slice(0, 4000);
  }

  return normalized.slice(0, 4000).trim();
};

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

    const markdown = (result as { markdown?: unknown }).markdown;
    if (typeof markdown === "string" && markdown.trim()) {
      const snippet = pickMarkdownSnippet(markdown);
      if (snippet) {
        return {
          success: true,
          extract: {
            answer: snippet,
          },
        };
      }
    }
  } catch (err) {
    console.error(`Scrape failed for ${url}:`, err);
  }

  return { success: false };
}
