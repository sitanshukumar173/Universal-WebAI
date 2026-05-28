import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import aiRoute from "./routes/query.routes.js";

import { connectDB } from "./db.js";
dotenv.config();

const app = express();
app.use(express.json());

app.use((req: Request, res: Response, next) => {
  const startedAt = Date.now();

  console.log(`[HTTP][IN] ${req.method} ${req.originalUrl}`);

  res.on("finish", () => {
    console.log(
      `[HTTP][OUT] ${req.method} ${req.originalUrl} status=${res.statusCode} durationMs=${Date.now() - startedAt}`,
    );
  });

  next();
});

app.use(
  cors({
    origin: ["http://localhost:5173", /^chrome-extension:\/\//],
  }),
);

connectDB();

app.use("/api/v1", aiRoute);

const port = process.env.PORT || 5000;

console.log(
  `[BOOT] env GEMINI_KEY=${process.env.GEMINI_KEY ? "set" : "missing"} GEMINI_API_KEY=${process.env.GEMINI_API_KEY ? "set" : "missing"} GROQ_API_KEY=${process.env.GROQ_API_KEY || process.env.GORQ_KEY ? "set" : "missing"} FIRECRAWL_KEY=${process.env.FIRECRAWL_KEY ? "set" : "missing"} MONGO_URI=${process.env.MONGO_URI ? "set" : "missing"}`,
);

app.listen(port, () => console.log(` Universal WebAI Backend Live on ${port}`));
