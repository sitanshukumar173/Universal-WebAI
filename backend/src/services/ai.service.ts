import { getGenAI } from "../scraper.js";

const EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || "models/gemini-embedding-001";
const ANSWER_MODEL = process.env.GEMINI_ANSWER_MODEL || "gemini-2.5-flash";

//text->embedding
export const getEmbedding = async (text: string) => {
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({
    model: EMBEDDING_MODEL,
  });
  const result = await model.embedContent(text);
  return result.embedding.values;
};

//synthesize answer with ai
export const synthesizeAnswer = async (question: string, context: string) => {
  const buildFallbackAnswer = (rawContext: string) => {
    const cleanedSections = rawContext
      .split(/\n---\n/)
      .map((section) =>
        section
          .replace(/^Source URL:\s*.*$/gim, "")
          .replace(/^Extracted content:\s*/gim, "")
          .trim(),
      )
      .filter(Boolean);

    if (cleanedSections.length > 0) {
      return cleanedSections.slice(0, 2).join("\n\n");
    }

    return "No AI answer is available right now.";
  };

  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: ANSWER_MODEL });
    const prompt = `
      The user asked: "${question}"
      Website Data: ${context}
      Synthesize a helpful answer. Mention if the info came from a PDF.
    `;
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("Failed to synthesize answer:", error);
    return buildFallbackAnswer(context);
  }
};

export const synthesizeRelevantLinks = async (
  question: string,
  context: string,
  sources: string[],
) => {
  try {
    const genAI = getGenAI();
    const model = genAI.getGenerativeModel({ model: ANSWER_MODEL });
    const prompt = `
      The user asked: "${question}"
      Extracted website data: ${context}
      Allowed links:
      ${sources.join("\n")}

      Return ONLY a JSON array of up to 3 URLs from the allowed links that are most relevant to the answer.
      Do not include any markdown, labels, or extra text.
      If none are relevant, return an empty array.
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonText = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "");

    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      return Array.from(
        new Set(
          parsed.filter((value): value is string => typeof value === "string"),
        ),
      ).slice(0, 3);
    }
  } catch (error) {
    console.error("Failed to synthesize relevant links:", error);
  }

  return sources.slice(0, 3);
};
