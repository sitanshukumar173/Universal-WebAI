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
  const genAI = getGenAI();
  const model = genAI.getGenerativeModel({ model: ANSWER_MODEL });
  const prompt = `
    The user asked: "${question}"
    Website Data: ${context}
    Synthesize a helpful answer. Mention if the info came from a PDF.
  `;
  const result = await model.generateContent(prompt);
  return result.response.text();
};
