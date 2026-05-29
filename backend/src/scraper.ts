import Firecrawl from "@mendable/firecrawl-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractCompatRequest, ExtractCompatResult } from "./types.js";

type FirecrawlSelection = {
  preference?: "primary" | "secondary" | "roundRobin";
  keyIndex?: number;
};

type GeminiSelection = {
  keyIndex?: number;
};

type ClientEntry<T> = {
  client: T;
  source: string;
  suffix: string;
};

let firecrawlRoundRobinIndex = 0;
let geminiRoundRobinIndex = 0;
const firecrawlClients: ClientEntry<Firecrawl>[] = [];
const geminiClients: ClientEntry<GoogleGenerativeAI>[] = [];

const getEnvValue = (name: string) => {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  return raw.trim();
};

const resolveKeyPool = (primaryName: string, fallbackNames: string[]) => {
  const numbered = [1, 2]
    .map((index) => getEnvValue(`${primaryName}_${index}`))
    .filter(Boolean);

  if (numbered.length > 0) {
    return numbered;
  }

  const fallback = [primaryName, ...fallbackNames]
    .map((name) => getEnvValue(name))
    .find(Boolean);

  return fallback ? [fallback] : [];
};

const resolveGeminiKeys = () =>
  resolveKeyPool("GEMINI_KEY", ["GEMINI_API_KEY"]);

const resolveFirecrawlKeys = () => resolveKeyPool("FIRECRAWL_KEY", []);

const getSuffix = (value: string) => {
  const suffix = value.slice(-4);
  return suffix ? `****${suffix}` : "****";
};

const getPoolEntry = <T>(
  pool: ClientEntry<T>[],
  selection: number | undefined,
  roundRobinIndex: number,
) => {
  if (pool.length === 0) {
    return null;
  }

  if (typeof selection === "number" && Number.isFinite(selection)) {
    return pool[Math.abs(selection) % pool.length] ?? pool[0];
  }

  return pool[roundRobinIndex % pool.length] ?? pool[0];
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

const createFirecrawlClient = (key: string, source: string) => ({
  client: new Firecrawl({ apiKey: key }),
  source,
  suffix: getSuffix(key),
});

const createGeminiClient = (key: string, source: string) => ({
  client: new GoogleGenerativeAI(key),
  source,
  suffix: getSuffix(key),
});

function getFirecrawl(selection: FirecrawlSelection = {}): Firecrawl {
  if (firecrawlClients.length === 0) {
    const keys = resolveFirecrawlKeys();
    if (keys.length === 0) {
      throw new Error(
        "FIRECRAWL_KEY_1/FIRECRAWL_KEY_2 (or FIRECRAWL_KEY) is not set",
      );
    }

    keys.forEach((key, index) => {
      const source = `FIRECRAWL_KEY_${index + 1}`;
      firecrawlClients.push(createFirecrawlClient(key, source));
      console.log(
        `[AI][FIRECRAWL_KEY] source=${source} suffix=${getSuffix(key)}`,
      );
    });
  }

  const selected =
    typeof selection.keyIndex === "number"
      ? getPoolEntry(
          firecrawlClients,
          selection.keyIndex,
          firecrawlRoundRobinIndex,
        )
      : selection.preference === "primary"
        ? firecrawlClients[0]
        : selection.preference === "secondary"
          ? (firecrawlClients[1] ?? firecrawlClients[0])
          : getPoolEntry(
              firecrawlClients,
              undefined,
              firecrawlRoundRobinIndex++,
            );

  return selected?.client ?? firecrawlClients[0]!.client;
}

function getGenAI(selection: GeminiSelection = {}): GoogleGenerativeAI {
  if (geminiClients.length === 0) {
    const keys = resolveGeminiKeys();
    if (keys.length === 0) {
      throw new Error(
        "Gemini key is not set. Use GEMINI_KEY_1/GEMINI_KEY_2 (or GEMINI_KEY/GEMINI_API_KEY) in backend/.env",
      );
    }

    keys.forEach((key, index) => {
      const source = `GEMINI_KEY_${index + 1}`;
      geminiClients.push(createGeminiClient(key, source));
      console.log(`[AI][GEMINI_KEY] source=${source} suffix=${getSuffix(key)}`);
    });
  }

  const selected =
    typeof selection.keyIndex === "number"
      ? getPoolEntry(geminiClients, selection.keyIndex, geminiRoundRobinIndex)
      : getPoolEntry(geminiClients, undefined, geminiRoundRobinIndex++);

  return selected?.client ?? geminiClients[0]!.client;
}

export { getFirecrawl, getGenAI };

//scarap test from urls
export async function scrapeUrlCompat(
  url: string,
  request: ExtractCompatRequest,
): Promise<ExtractCompatResult> {
  const startedAt = Date.now();
  const hasJinaAuth = Boolean(process.env.JINA_KEY);
  const isPdfUrl = /\.pdf(?:[?#]|$)/i.test(url);

  const tryFirecrawlExtract = async (selection: FirecrawlSelection) => {
    const firecrawl = getFirecrawl(selection);
    const result = await firecrawl.extract({
      urls: [url],
      prompt:
        request.extract.prompt ||
        "Extract the most precise factual answer from this page and include supporting details.",
      schema: {
        type: "object",
        properties: {
          answer: { type: "string" },
          details: { type: "string" },
          found_in_pdf: { type: "boolean" },
        },
        required: ["answer"],
      },
      showSources: true,
    });

    const data = (result as { data?: unknown; success?: boolean }).data as
      | { answer?: unknown; details?: unknown; found_in_pdf?: unknown }
      | undefined;

    const answer =
      typeof data?.answer === "string"
        ? data.answer.trim()
        : typeof data?.details === "string"
          ? data.details.trim().slice(0, 1200)
          : "";

    const details =
      typeof data?.details === "string"
        ? data.details.trim()
        : typeof data?.answer === "string"
          ? data.answer.trim()
          : "";

    return {
      success:
        Boolean((result as { success?: boolean }).success) && Boolean(answer),
      extract: {
        answer,
        details,
        found_in_pdf: Boolean(data?.found_in_pdf || isPdfUrl),
      },
    };
  };

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

    console.warn(
      `[JINA][SCRAPE][FALLBACK] url=${url} reason=${isPdfUrl ? "pdf-or-empty" : "empty-or-unsupported"}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[JINA][SCRAPE][ERROR] url=${url} durationMs=${Date.now() - startedAt} error=${message}`,
    );
  }

  try {
    const primaryResult = await tryFirecrawlExtract({ preference: "primary" });
    if (primaryResult.success) {
      console.log(
        `[FIRECRAWL][SCRAPE][OK] url=${url} mode=primary durationMs=${Date.now() - startedAt}`,
      );
      return primaryResult;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[FIRECRAWL][SCRAPE][ERROR] url=${url} mode=primary durationMs=${Date.now() - startedAt} error=${message}`,
    );
  }

  try {
    const secondaryResult = await tryFirecrawlExtract({
      preference: "secondary",
    });
    if (secondaryResult.success) {
      console.log(
        `[FIRECRAWL][SCRAPE][OK] url=${url} mode=secondary durationMs=${Date.now() - startedAt}`,
      );
      return secondaryResult;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[FIRECRAWL][SCRAPE][ERROR] url=${url} mode=secondary durationMs=${Date.now() - startedAt} error=${message}`,
    );
  }

  return { success: false };
}
