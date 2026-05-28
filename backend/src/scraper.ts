import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractCompatRequest, ExtractCompatResult } from "./types.js";

let firecrawl: Firecrawl | null = null;
let genAI: GoogleGenerativeAI | null = null;

const getEnvValue = (name: string) => {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  return raw.trim();
};

const resolveGeminiKey = () => {
  const fromGeminiKey = getEnvValue("GEMINI_KEY");
  if (fromGeminiKey) {
    return { key: fromGeminiKey, source: "GEMINI_KEY" as const };
  }

  const fromGeminiApiKey = getEnvValue("GEMINI_API_KEY");
  if (fromGeminiApiKey) {
    return { key: fromGeminiApiKey, source: "GEMINI_API_KEY" as const };
  }

  return null;
};

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
    const resolvedGeminiKey = resolveGeminiKey();
    if (!resolvedGeminiKey) {
      throw new Error(
        "Gemini key is not set. Use GEMINI_KEY or GEMINI_API_KEY in backend/.env",
      );
    }

    const maskedSuffix = resolvedGeminiKey.key.slice(-4);
    console.log(
      `[AI][GEMINI_KEY] source=${resolvedGeminiKey.source} suffix=****${maskedSuffix}`,
    );

    genAI = new GoogleGenerativeAI(resolvedGeminiKey.key);
  }
  return genAI;
}

export { getFirecrawl, getGenAI };

//scarap test from urls
export async function scrapeUrlCompat(
  url: string,
  request: ExtractCompatRequest,
): Promise<ExtractCompatResult> {
  const startedAt = Date.now();
  const hasJinaAuth = Boolean(process.env.JINA_KEY);

  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const headers: Record<string, string> = {};

    console.log(
      `[JINA][SCRAPE][START] url=${url} auth=${hasJinaAuth ? "yes" : "no"}`,
    );

    if (process.env.JINA_KEY) {
      headers.Authorization = `Bearer ${process.env.JINA_KEY}`;
    }

    const response = await fetch(jinaUrl, {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      throw new Error(`Jina Reader request failed with ${response.status}`);
    }

    const markdown = normalizeWhitespace(await response.text()).trim();
    const truncatedMarkdown = markdown.slice(0, 3000);
    console.log(
      `[JINA][SCRAPE][OK] url=${url} status=${response.status} bytes=${truncatedMarkdown.length} durationMs=${Date.now() - startedAt}`,
    );

    if (truncatedMarkdown) {
      const snippet = pickMarkdownSnippet(truncatedMarkdown);
      if (snippet) {
        return {
          success: true,
          extract: {
            answer: snippet,
            details: truncatedMarkdown,
          },
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[JINA][SCRAPE][ERROR] url=${url} durationMs=${Date.now() - startedAt} error=${message}`,
    );
  }

  return { success: false };
}
