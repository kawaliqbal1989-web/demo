import {
  getInsightAnalytics,
  getAiPlaygroundAnalytics,
  getAiAnalyticsDashboard,
} from "../services/recommendation-analytics.service.js";
import { logger } from "../lib/logger.js";

export async function handleGetInsightAnalytics(req, res) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const data = await getInsightAnalytics(req.auth.tenantId, { days });
    res.json(data);
  } catch (err) {
    logger.error("insight_analytics_endpoint_error", { error: err.message });
    res.status(500).json({ error: "Failed to load insight analytics" });
  }
}

export async function handleGetPlaygroundAnalytics(req, res) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const data = await getAiPlaygroundAnalytics(req.auth.tenantId, { days });
    res.json(data);
  } catch (err) {
    logger.error("playground_analytics_endpoint_error", { error: err.message });
    res.status(500).json({ error: "Failed to load playground analytics" });
  }
}

export async function handleGetAiDashboard(req, res) {
  try {
    const days = Math.min(Number(req.query.days) || 30, 365);
    const data = await getAiAnalyticsDashboard(req.auth.tenantId, { days });
    res.json(data);
  } catch (err) {
    logger.error("ai_dashboard_endpoint_error", { error: err.message });
    res.status(500).json({ error: "Failed to load AI analytics dashboard" });
  }
}
