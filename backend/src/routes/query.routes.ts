import { Router } from "express";
import { handleQuery } from "../controllers/query.controller.js";

const router = Router();

router.post("/query", handleQuery);

export default router;
