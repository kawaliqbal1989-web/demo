import { Router } from "express";
import {
  listInsights,
  getSummary,
  dismiss,
  markActioned,
} from "../controllers/insights.controller.js";
import { getApprovalQueueSummary } from "../services/approval-queue.service.js";

const insightsRouter = Router();

insightsRouter.get("/", listInsights);
insightsRouter.get("/summary", getSummary);
insightsRouter.patch("/:id/dismiss", dismiss);
insightsRouter.patch("/:id/action", markActioned);

insightsRouter.get("/approval-queue", async (req, res) => {
  try {
    const result = await getApprovalQueueSummary({
      tenantId: req.auth.tenantId,
      role: req.auth.role,
    });
    res.json(result);
  } catch (err) {
    console.error('Approval queue error:', err);
    res.status(500).json({ error: err.message });
  }
});

export { insightsRouter };
