import { asyncHandler } from "../utils/async-handler.js";
import {
  claimArenaMobileTask as claimArenaMobileTaskService,
  startArenaMobileTask as startArenaMobileTaskService,
  submitArenaMobileTask as submitArenaMobileTaskService
} from "../services/arena-mobile-task.service.js";

const claimArenaMobileTask = asyncHandler(async (req, res) => {
  const result = await claimArenaMobileTaskService({
    handoffToken: req.body?.handoffToken
  });
  return res.apiSuccess("Arena mobile task connected", result);
});

const startArenaMobileTask = asyncHandler(async (req, res) => {
  const result = await startArenaMobileTaskService({
    claimToken: req.body?.claimToken
  });
  return res.apiSuccess("Arena mobile task started", result);
});

const submitArenaMobileTask = asyncHandler(async (req, res) => {
  const result = await submitArenaMobileTaskService({
    claimToken: req.body?.claimToken,
    attemptCount: req.body?.attemptCount,
    correctCount: req.body?.correctCount,
    durationMs: req.body?.durationMs,
    metrics: req.body?.metrics
  });
  return res.apiSuccess("Arena mobile task submitted", result);
});

export { claimArenaMobileTask, startArenaMobileTask, submitArenaMobileTask };
