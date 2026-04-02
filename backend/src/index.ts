import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import aiRoute from "./routes/query.routes.js";

import { connectDB } from "./db.js";
dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: ["http://localhost:5173", /^chrome-extension:\/\//],
  }),
);

connectDB();

app.use("/api/v1", aiRoute);

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(` Universal WebAI Backend Live on ${port}`));
