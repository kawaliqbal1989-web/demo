import { Router } from "express";
import { authRateLimiter } from "../middleware/auth-rate-limit.js";
import {
  claimArenaMobileTask,
  startArenaMobileTask,
  submitArenaMobileTask
} from "../controllers/arena-mobile-task.controller.js";

const arenaMobileTaskPublicRouter = Router();

arenaMobileTaskPublicRouter.post("/claim", authRateLimiter, claimArenaMobileTask);
arenaMobileTaskPublicRouter.post("/start", authRateLimiter, startArenaMobileTask);
arenaMobileTaskPublicRouter.post("/submit", authRateLimiter, submitArenaMobileTask);

export { arenaMobileTaskPublicRouter };
