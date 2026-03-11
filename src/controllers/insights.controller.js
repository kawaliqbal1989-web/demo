import { asyncHandler } from "../utils/async-handler.js";
import {
  getInsightsForUser,
  dismissInsight,
  actionInsight,
  getInsightSummary,
} from "../services/insight-engine.service.js";

const listInsights = asyncHandler(async (req, res) => {
  const insights = await getInsightsForUser(req.auth);
  return res.apiSuccess("Insights fetched", { insights });
});

const getSummary = asyncHandler(async (req, res) => {
  const summary = await getInsightSummary(req.auth.userId, req.auth.tenantId);
  return res.apiSuccess("Insight summary fetched", summary);
});

const dismiss = asyncHandler(async (req, res) => {
  await dismissInsight(String(req.params.id || "").trim(), req.auth.userId, req.auth.tenantId);
  return res.apiSuccess("Insight dismissed");
});

const markActioned = asyncHandler(async (req, res) => {
  await actionInsight(String(req.params.id || "").trim(), req.auth.userId, req.auth.tenantId);
  return res.apiSuccess("Insight actioned");
});

export { listInsights, getSummary, dismiss, markActioned };
