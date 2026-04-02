import express, { type Request, type Response } from "express";
import dotenv from "dotenv";
import aiRoute from "./routes/query.routes.js";

import { connectDB } from "./db.js";
dotenv.config();

const app = express();
app.use(express.json());

connectDB();

app.use("/ai", aiRoute);

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(` Universal WebAI Backend Live on ${port}`));
