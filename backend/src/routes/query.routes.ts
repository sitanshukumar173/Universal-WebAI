import { Router } from "express";
import {
  handleQuery,
  handleQueryStream,
  handleWarmup,
} from "../controllers/query.controller.js";

const router = Router();

router.post("/site/warmup", handleWarmup);
router.post("/query/stream", handleQueryStream);
router.post("/query", handleQuery);

export default router;
