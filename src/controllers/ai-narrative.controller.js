import {
  generateStudentNarrative,
  generateTeacherNarrative,
  generateCenterNarrative,
  generateNetworkNarrative,
  generateCommandCenterNarrative,
  checkNarrativeRateLimit,
  getNarrativeUsageStats,
} from "../services/ai-narrative.service.js";
import { getStudent360Data } from "../services/student-360.service.js";
import { logger } from "../lib/logger.js";

// Rate limit check helper — returns 429 if exceeded
function enforceRateLimit(req, res) {
  const { allowed, reason, retryAfterMs } = checkNarrativeRateLimit(req.auth.tenantId, req.auth.userId);
  if (!allowed) {
    logger.warn("ai_narrative_rate_limited", { userId: req.auth.userId, tenantId: req.auth.tenantId, reason });
    res.set("Retry-After", String(Math.ceil((retryAfterMs || 3600000) / 1000)));
    res.status(429).json({ error: "Rate limit exceeded. Please try again later.", reason });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Narrative usage stats (superadmin only)
// ---------------------------------------------------------------------------
export function getAiNarrativeStats(req, res) {
  res.json(getNarrativeUsageStats());
}

// ---------------------------------------------------------------------------
// Student AI Coach Narrative
// ---------------------------------------------------------------------------
export async function getStudentAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const studentId = req.student.id;
    const tenantId = req.auth.tenantId;
    const data360 = await getStudent360Data(studentId, tenantId);
    const narrative = await generateStudentNarrative(data360, tenantId);
    res.json(narrative);
  } catch (err) {
    logger.error("student_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}

// ---------------------------------------------------------------------------
// Teacher Intervention Copilot Narrative
// ---------------------------------------------------------------------------
export async function getTeacherAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const { prisma } = await import("../lib/prisma.js");
    const teacher = await prisma.authUser.findFirst({
      where: { id: req.auth.userId, tenantId: req.auth.tenantId, role: "TEACHER", isActive: true },
      select: { id: true, hierarchyNodeId: true },
    });
    if (!teacher) return res.status(404).json({ error: "Teacher not found" });

    const cockpitMod = await import("../services/teacher-cockpit.service.js");
    const [atRiskStudents, batchHeatmap, recommendations, interventions] = await Promise.all([
      cockpitMod.getAtRiskQueue(teacher.id, req.auth.tenantId, teacher.hierarchyNodeId),
      cockpitMod.getBatchHeatmap(teacher.id, req.auth.tenantId, teacher.hierarchyNodeId),
      cockpitMod.getWorksheetRecommendations(teacher.id, req.auth.tenantId, teacher.hierarchyNodeId),
      cockpitMod.getInterventionSuggestions(teacher.id, req.auth.tenantId, teacher.hierarchyNodeId),
    ]);
    const narrative = await generateTeacherNarrative({
      teacherId: teacher.id,
      atRiskStudents,
      batchHeatmap,
      recommendations,
      interventions,
    }, req.auth.tenantId);
    res.json(narrative);
  } catch (err) {
    logger.error("teacher_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}

// ---------------------------------------------------------------------------
// Center Operations Assistant Narrative
// ---------------------------------------------------------------------------
export async function getCenterAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const centerId = req.auth.hierarchyNodeId;
    const tenantId = req.auth.tenantId;
    const intelMod = await import("../services/leadership-intel.service.js");
    const [healthScore, teacherWorkload, anomalies, feePulse] = await Promise.all([
      intelMod.getCenterHealthScore(tenantId, centerId),
      intelMod.getTeacherWorkload(tenantId, centerId),
      intelMod.getAttendanceAnomalies(tenantId, centerId),
      intelMod.getFeeCollectionPulse(tenantId, centerId),
    ]);
    const narrative = await generateCenterNarrative({
      centerId,
      healthScore,
      teacherWorkload,
      anomalies,
      feePulse,
    }, tenantId);
    res.json(narrative);
  } catch (err) {
    logger.error("center_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}

// ---------------------------------------------------------------------------
// Franchise Network Advisor Narrative
// ---------------------------------------------------------------------------
export async function getFranchiseAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const tenantId = req.auth.tenantId;
    const hierarchyNodeIds = req.franchiseScope?.hierarchyNodeIds || [];
    const intelMod = await import("../services/leadership-intel.service.js");
    const pulse = await intelMod.getNetworkPulse(tenantId, hierarchyNodeIds);
    const narrative = await generateNetworkNarrative(pulse, "FRANCHISE", tenantId);
    res.json(narrative);
  } catch (err) {
    logger.error("franchise_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}

// ---------------------------------------------------------------------------
// BP Network Advisor Narrative
// ---------------------------------------------------------------------------
export async function getBpAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const tenantId = req.auth.tenantId;
    const hierarchyNodeIds = req.bpScope?.hierarchyNodeIds || [];
    const intelMod = await import("../services/leadership-intel.service.js");
    const pulse = await intelMod.getNetworkPulse(tenantId, hierarchyNodeIds);
    const narrative = await generateNetworkNarrative(pulse, "BP", tenantId);
    res.json(narrative);
  } catch (err) {
    logger.error("bp_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}

// ---------------------------------------------------------------------------
// Superadmin Command Center Narrative
// ---------------------------------------------------------------------------
export async function getSuperadminAiNarrative(req, res) {
  try {
    if (!enforceRateLimit(req, res)) return;
    const tenantId = req.auth.tenantId;
    const [intelMod, approvalMod] = await Promise.all([
      import("../services/leadership-intel.service.js"),
      import("../services/approval-queue.service.js"),
    ]);

    // Superadmin sees all centers — get all hierarchy nodes
    const { prisma } = await import("../lib/prisma.js");
    const allCenters = await prisma.authUser.findMany({
      where: { tenantId, role: "CENTER", isActive: true, hierarchyNodeId: { not: null } },
      select: { hierarchyNodeId: true },
    });
    const centerIds = [...new Set(allCenters.map((center) => center.hierarchyNodeId).filter(Boolean))];

    const [networkPulse, approvalQueue] = await Promise.all([
      intelMod.getNetworkPulse(tenantId, centerIds),
      approvalMod.getApprovalQueueSummary({ tenantId, role: "SUPERADMIN" }),
    ]);

    // Aggregate approval info
    const totalPending = (approvalQueue.exams?.pending || 0) + (approvalQueue.competitions?.pending || 0);
    const overdueItems = [...(approvalQueue.exams?.items || []), ...(approvalQueue.competitions?.items || [])].filter(
      (item) => item.hoursWaiting > (item.slaHours || 24)
    );

    // Fee data from network pulse
    const revenueData = {
      collected: networkPulse?.aggregate?.totalCollected ?? 0,
      overdue: networkPulse?.aggregate?.totalOverdue ?? 0,
      trend: networkPulse?.aggregate?.revenueTrend ?? 0,
    };

    const narrative = await generateCommandCenterNarrative({
      tenantId,
      networkPulse,
      pendingApprovals: { totalPending, overdue: overdueItems.length },
      revenueData,
      anomalySummary: { total: 0 }, // Would aggregate across centers if needed
    });
    res.json(narrative);
  } catch (err) {
    logger.error("superadmin_ai_narrative_error", { error: err.message });
    res.status(500).json({ error: "Failed to generate narrative" });
  }
}
