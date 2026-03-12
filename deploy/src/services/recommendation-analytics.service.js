import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { getNarrativeUsageStats } from "./ai-narrative.service.js";

/**
 * Recommendation Analytics Service — measures effectiveness of insights,
 * AI narratives, and coach recommendations across the platform.
 */

// ---------------------------------------------------------------------------
// Insight effectiveness metrics
// ---------------------------------------------------------------------------
export async function getInsightAnalytics(tenantId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [total, dismissed, actioned, bySeverity, byCategory] = await Promise.all([
      prisma.insight.count({ where: { tenantId, createdAt: { gte: since } } }),
      prisma.insight.count({ where: { tenantId, createdAt: { gte: since }, isDismissed: true } }),
      prisma.insight.count({ where: { tenantId, createdAt: { gte: since }, isActioned: true } }),
      prisma.insight.groupBy({
        by: ["severity"],
        where: { tenantId, createdAt: { gte: since } },
        _count: { id: true },
      }),
      prisma.insight.groupBy({
        by: ["category"],
        where: { tenantId, createdAt: { gte: since } },
        _count: { id: true },
      }),
    ]);

    const actionRate = total > 0 ? Math.round((actioned / total) * 100) : 0;
    const dismissRate = total > 0 ? Math.round((dismissed / total) * 100) : 0;
    const ignoreRate = total > 0 ? 100 - actionRate - dismissRate : 0;

    return {
      period: `${days}d`,
      total,
      actioned,
      dismissed,
      ignored: total - actioned - dismissed,
      actionRate,
      dismissRate,
      ignoreRate,
      bySeverity: bySeverity.reduce((acc, s) => { acc[s.severity] = s._count.id; return acc; }, {}),
      byCategory: byCategory.reduce((acc, c) => { acc[c.category] = c._count.id; return acc; }, {}),
    };
  } catch (err) {
    logger.error("insight_analytics_error", { error: err.message });
    return { period: `${days}d`, total: 0, actioned: 0, dismissed: 0, ignored: 0, actionRate: 0, dismissRate: 0, ignoreRate: 0, bySeverity: {}, byCategory: {} };
  }
}

// ---------------------------------------------------------------------------
// AI Playground usage metrics
// ---------------------------------------------------------------------------
export async function getAiPlaygroundAnalytics(tenantId, { days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const [totalCalls, uniqueStudents, byTool, tokenUsage] = await Promise.all([
      prisma.aiPlaygroundLog.count({ where: { tenantId, createdAt: { gte: since } } }),
      prisma.aiPlaygroundLog.groupBy({
        by: ["studentId"],
        where: { tenantId, createdAt: { gte: since } },
      }).then(r => r.length),
      prisma.aiPlaygroundLog.groupBy({
        by: ["toolName"],
        where: { tenantId, createdAt: { gte: since } },
        _count: { id: true },
        _sum: { tokensUsed: true },
      }),
      prisma.aiPlaygroundLog.aggregate({
        where: { tenantId, createdAt: { gte: since } },
        _sum: { tokensUsed: true, durationMs: true },
        _avg: { tokensUsed: true, durationMs: true },
      }),
    ]);

    return {
      period: `${days}d`,
      totalCalls,
      uniqueStudents,
      totalTokens: tokenUsage._sum.tokensUsed || 0,
      avgTokensPerCall: Math.round(tokenUsage._avg.tokensUsed || 0),
      avgDurationMs: Math.round(tokenUsage._avg.durationMs || 0),
      byTool: byTool.reduce((acc, t) => {
        acc[t.toolName] = { calls: t._count.id, tokens: t._sum.tokensUsed || 0 };
        return acc;
      }, {}),
    };
  } catch (err) {
    logger.error("ai_playground_analytics_error", { error: err.message });
    return { period: `${days}d`, totalCalls: 0, uniqueStudents: 0, totalTokens: 0, avgTokensPerCall: 0, avgDurationMs: 0, byTool: {} };
  }
}

// ---------------------------------------------------------------------------
// Combined AI analytics dashboard data
// ---------------------------------------------------------------------------
export async function getAiAnalyticsDashboard(tenantId, { days = 30 } = {}) {
  const [insights, playground, narrativeStats] = await Promise.all([
    getInsightAnalytics(tenantId, { days }),
    getAiPlaygroundAnalytics(tenantId, { days }),
    Promise.resolve(getNarrativeUsageStats()),
  ]);

  return {
    insights,
    playground,
    narrative: narrativeStats,
    summary: {
      totalAiInteractions: (playground.totalCalls || 0) + (narrativeStats.totalCalls || 0),
      totalTokensConsumed: (playground.totalTokens || 0) + (narrativeStats.totalTokens || 0),
      insightActionRate: insights.actionRate,
      cacheHitRate: narrativeStats.totalCalls > 0
        ? Math.round((narrativeStats.cacheHits / (narrativeStats.cacheHits + narrativeStats.totalCalls)) * 100)
        : 0,
    },
  };
}
