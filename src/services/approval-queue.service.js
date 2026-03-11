import { prisma } from '../lib/prisma.js';

// ─── SLA Configuration (in hours) ───────────────────────────
const SLA_CONFIG = {
  CENTER_REVIEW: 48,
  FRANCHISE_REVIEW: 48,
  BP_REVIEW: 72,
  SUPERADMIN_APPROVAL: 24,
};

// ─── Pending Approval Summary ───────────────────────────────
export async function getApprovalQueueSummary({ tenantId, role }) {
  const result = { exams: { pending: 0, overdue: 0, items: [] }, competitions: { pending: 0, overdue: 0, items: [] } };
  const now = new Date();

  // Exam enrollment lists pending at this role's stage
  const examStageMap = {
    CENTER: 'DRAFT',
    FRANCHISE: 'SUBMITTED_TO_FRANCHISE',
    BP: 'SUBMITTED_TO_BUSINESS_PARTNER',
    SUPERADMIN: 'SUBMITTED_TO_SUPERADMIN',
  };
  const examStatus = examStageMap[role];
  if (examStatus) {
    const lists = await prisma.examEnrollmentList.findMany({
      where: { tenantId, status: examStatus },
      select: { id: true, status: true, submittedAt: true, forwardedAt: true, createdAt: true, examCycle: { select: { name: true } }, centerNode: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    result.exams.pending = lists.length;
    result.exams.items = lists.map(l => {
      const stageStart = l.forwardedAt || l.submittedAt || l.createdAt;
      const hoursWaiting = (now - stageStart) / (1000 * 60 * 60);
      const slaHours = SLA_CONFIG[role === 'SUPERADMIN' ? 'SUPERADMIN_APPROVAL' : `${role}_REVIEW`] || 48;
      const overdue = hoursWaiting > slaHours;
      if (overdue) result.exams.overdue++;
      return {
        id: l.id,
        status: l.status,
        cycleName: l.examCycle?.name,
        centerName: l.centerNode?.name,
        stageStart,
        hoursWaiting: Math.round(hoursWaiting),
        slaHours,
        overdue,
      };
    });
  }

  // Competition approvals pending at this role's stage
  const compStageMap = {
    CENTER: 'CENTER_REVIEW',
    FRANCHISE: 'FRANCHISE_REVIEW',
    BP: 'BP_REVIEW',
    SUPERADMIN: 'SUPERADMIN_APPROVAL',
  };
  const compStage = compStageMap[role];
  if (compStage) {
    const comps = await prisma.competition.findMany({
      where: { tenantId, workflowStage: compStage },
      select: { id: true, title: true, workflowStage: true, createdAt: true, hierarchyNode: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    // Get last transition for SLA anchoring
    for (const c of comps) {
      const lastTransition = await prisma.competitionStageTransition.findFirst({
        where: { competitionId: c.id, toStage: compStage },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const stageStart = lastTransition?.createdAt || c.createdAt;
      const hoursWaiting = (now - stageStart) / (1000 * 60 * 60);
      const slaHours = SLA_CONFIG[compStage] || 48;
      const overdue = hoursWaiting > slaHours;
      if (overdue) result.competitions.overdue++;
      result.competitions.items.push({
        id: c.id,
        name: c.title,
        stage: c.workflowStage,
        centerName: c.hierarchyNode?.name,
        stageStart,
        hoursWaiting: Math.round(hoursWaiting),
        slaHours,
        overdue,
      });
    }
    result.competitions.pending = comps.length;
  }

  return result;
}

// ─── Overdue Items (for notifications) ──────────────────────
export async function getOverdueApprovals({ tenantId }) {
  const now = new Date();
  const overdue = [];

  // Check all stages for overdue exam lists
  for (const [stage, slaHours] of Object.entries(SLA_CONFIG)) {
    const examStageMap = {
      CENTER_REVIEW: 'DRAFT',
      FRANCHISE_REVIEW: 'SUBMITTED_TO_FRANCHISE',
      BP_REVIEW: 'SUBMITTED_TO_BUSINESS_PARTNER',
      SUPERADMIN_APPROVAL: 'SUBMITTED_TO_SUPERADMIN',
    };
    const examStatus = examStageMap[stage];
    if (!examStatus) continue;

    const cutoff = new Date(now.getTime() - slaHours * 60 * 60 * 1000);
    const lists = await prisma.examEnrollmentList.findMany({
      where: {
        tenantId,
        status: examStatus,
        OR: [
          { forwardedAt: { lt: cutoff } },
          { forwardedAt: null, submittedAt: { lt: cutoff } },
          { submittedAt: null, createdAt: { lt: cutoff } },
        ],
      },
      select: { id: true, status: true },
    });
    for (const l of lists) {
      overdue.push({ type: 'exam', id: l.id, stage, status: l.status });
    }
  }

  return overdue;
}
