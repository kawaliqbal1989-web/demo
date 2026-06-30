import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const listFranchiseCompetitionCenters = asyncHandler(async (req, res) => {
  const { competitionId } = req.params;

  const centers = await prisma.competitionEnrollment.groupBy({
    by: ["tenantId"],
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true }
  });

  // Fetch per-center submissions and build summary from registrations
  const submissions = await prisma.competitionCenterSubmission.findMany({
    where: { competitionId, tenantId: req.auth.tenantId }
  });

  // Build a simple centers list from submissions and registrations per student hierarchy
  const registrations = await prisma.competitionEnrollment.findMany({
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
    select: {
      student: { select: { hierarchyNodeId: true, currentTeacherUserId: true, level: { select: { id: true, name: true } } } },
      levelId: true,
      studentId: true,
      enrolledAt: true
    }
  });

  const centerMap = new Map();
  for (const r of registrations) {
    const centerId = r.student.hierarchyNodeId || "unknown";
    const entry = centerMap.get(centerId) || { centerId, totalStudents: 0, teachers: new Set(), tempStudents: 0, levelCounts: {} };
    entry.totalStudents += 1;
    if (r.student.currentTeacherUserId) entry.teachers.add(r.student.currentTeacherUserId);
    if (r.student.level && r.student.level.id) entry.levelCounts[r.student.level.id] = (entry.levelCounts[r.student.level.id] || 0) + 1;
    centerMap.set(centerId, entry);
  }

  const rows = [];
  for (const [centerId, summary] of centerMap.entries()) {
    const submission = submissions.find((s) => s.centerId === centerId) || null;
    rows.push({
      centerId,
      centerName: centerId,
      teachers: Array.from(summary.teachers).length,
      totalStudents: summary.totalStudents,
      temporaryStudents: summary.tempStudents,
      levelSummary: Object.entries(summary.levelCounts).map(([levelId, count]) => ({ levelId, count })),
      submissionDate: submission ? submission.submittedAt : null,
      status: submission ? submission.status : null
    });
  }

  return res.apiSuccess("Franchise competition centers fetched", { centers: rows, submissions });
});

const getFranchiseCompetitionCenterDetail = asyncHandler(async (req, res) => {
  const { competitionId, centerId } = req.params;

  const submissions = await prisma.competitionCenterSubmission.findMany({
    where: { competitionId, tenantId: req.auth.tenantId, centerId }
  });

  const registrations = await prisma.competitionEnrollment.findMany({
    where: { competitionId, tenantId: req.auth.tenantId, isActive: true },
    select: {
      studentId: true,
      levelId: true,
      student: { select: { id: true, admissionNo: true, firstName: true, lastName: true, hierarchyNodeId: true, currentTeacherUserId: true } },
      enrolledAt: true
    }
  });

  const centerRegs = registrations.filter((r) => String(r.student.hierarchyNodeId) === String(centerId));

  return res.apiSuccess("Franchise competition center detail fetched", { centerId, registrations: centerRegs, submissions });
});

const returnFranchiseCompetitionCenter = asyncHandler(async (req, res) => {
  const { competitionId, centerId } = req.params;
  const { remark } = req.body;

  if (!remark || !String(remark).trim()) {
    return res.apiError(400, "remark is required", "VALIDATION_ERROR");
  }

  const submission = await prisma.competitionCenterSubmission.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      centerId,
      status: "REOPENED",
      remark: String(remark).trim(),
      submittedByUserId: req.auth.userId
    }
  });

  // Record a stage transition for audit
  await prisma.competitionStageTransition.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      fromStage: "CENTER_SUBMITTED",
      toStage: "CENTER_REOPENED",
      action: "REJECT",
      reason: remark || null,
      actedByUserId: req.auth.userId
    }
  });

  return res.apiSuccess("Center returned to center for edits", submission);
});

const approveFranchiseCompetitionCenter = asyncHandler(async (req, res) => {
  const { competitionId, centerId } = req.params;

  const submission = await prisma.competitionCenterSubmission.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      centerId,
      status: "APPROVED",
      submittedByUserId: req.auth.userId
    }
  });

  await prisma.competitionStageTransition.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      fromStage: "CENTER_SUBMITTED",
      toStage: "FRANCHISE_REVIEW",
      action: "FORWARD",
      reason: null,
      actedByUserId: req.auth.userId
    }
  });

  // Check if all centers are approved (basic heuristic: if any center has SUBMITTED not approved, block)
  const pending = await prisma.competitionCenterSubmission.findFirst({
    where: { competitionId, tenantId: req.auth.tenantId, status: "SUBMITTED" }
  });

  // If no pending submissions, update competition workflow to FRANCHISE_SUBMITTED
  if (!pending) {
    await prisma.competition.update({ where: { id: competitionId }, data: { workflowStage: "FRANCHISE_SUBMITTED" } });
    await prisma.competitionStageTransition.create({
      data: {
        tenantId: req.auth.tenantId,
        competitionId,
        fromStage: "FRANCHISE_REVIEW",
        toStage: "FRANCHISE_SUBMITTED",
        action: "FORWARD",
        reason: null,
        actedByUserId: req.auth.userId
      }
    });
  }

  return res.apiSuccess("Center approved by franchise", submission);
});

const submitFranchiseCompetition = asyncHandler(async (req, res) => {
  const { competitionId } = req.params;

  // Only allow if all centers with submissions are approved
  const pending = await prisma.competitionCenterSubmission.findFirst({
    where: { competitionId, tenantId: req.auth.tenantId, status: "SUBMITTED" }
  });
  if (pending) {
    return res.apiError(409, "Not all centers are approved", "CENTERS_PENDING_APPROVAL");
  }

  const updated = await prisma.competition.update({ where: { id: competitionId }, data: { workflowStage: "BUSINESS_PARTNER_REVIEW" } });

  await prisma.competitionStageTransition.create({
    data: {
      tenantId: req.auth.tenantId,
      competitionId,
      fromStage: "FRANCHISE_SUBMITTED",
      toStage: "BUSINESS_PARTNER_REVIEW",
      action: "FORWARD",
      reason: null,
      actedByUserId: req.auth.userId
    }
  });

  return res.apiSuccess("Franchise submitted competition to business partner", updated);
});

export {
  listFranchiseCompetitionCenters,
  getFranchiseCompetitionCenterDetail,
  returnFranchiseCompetitionCenter,
  approveFranchiseCompetitionCenter,
  submitFranchiseCompetition
};
