import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";

const listBpCompetitionFranchises = asyncHandler(async (req, res) => {
  const { competitionId } = req.params;
  const bpScope = req.bpScope || {};

  // Franchises in BP scope
  const franchiseIds = bpScope.franchiseIds || [];

  const franchises = await prisma.franchiseProfile.findMany({ where: { tenantId: req.auth.tenantId, id: { in: franchiseIds } }, select: { id: true, name: true } });

  // Aggregate counts
  const totalFranchises = franchises.length;

  // Centers under BP scope
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: { in: franchiseIds } }, select: { id: true, franchiseProfileId: true } });
  const centerIds = centers.map((c) => c.id);

  const totalCenters = centerIds.length;

  // Competition enrollments stats for centers in scope
  const studentCounts = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds } } } });

  const tempStudentCounts = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds }, isTemporaryExam: true } } });

  // Submission aggregates by center -> map to franchise
  const submissions = await prisma.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds } } });

  const submissionByCenter = new Map();
  for (const s of submissions) {
    submissionByCenter.set(s.centerId, s);
  }

  const rows = [];
  for (const f of franchises) {
    const fCenters = centers.filter((c) => String(c.franchiseProfileId) === String(f.id)).map((c) => c.id);
    const centersCount = fCenters.length;
    const studentsCount = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: fCenters } } } });
    const tempCount = await prisma.competitionEnrollment.count({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: fCenters }, isTemporaryExam: true } } });

    // Determine franchise-level submission status: if any center has SUBMITTED => Submitted, if any APPROVED => Approved, if any REOPENED => Returned
    const centerSubmissions = submissions.filter((s) => fCenters.includes(s.centerId));
    const status = centerSubmissions.find((s) => s.status === "SUBMITTED")
      ? "SUBMITTED"
      : centerSubmissions.find((s) => s.status === "APPROVED")
      ? "APPROVED"
      : centerSubmissions.find((s) => s.status === "REOPENED")
      ? "RETURNED"
      : null;

    const submissionDate = centerSubmissions.length ? centerSubmissions[centerSubmissions.length - 1].submittedAt : null;

    rows.push({ franchiseId: f.id, franchiseName: f.name, centers: centersCount, students: studentsCount, temporaryStudents: tempCount, submissionDate, status });
  }

  const summary = {
    totalFranchises,
    submittedFranchises: rows.filter((r) => r.status === "SUBMITTED").length,
    approvedFranchises: rows.filter((r) => r.status === "APPROVED").length,
    returnedFranchises: rows.filter((r) => r.status === "RETURNED").length,
    totalCenters,
    totalStudents: studentCounts,
    temporaryStudents: tempStudentCounts
  };

  return res.apiSuccess("BP competition franchises fetched", { summary, franchises: rows });
});

const getBpCompetitionFranchiseDetail = asyncHandler(async (req, res) => {
  const { competitionId, franchiseId } = req.params;

  // Centers for franchise
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: franchiseId }, select: { id: true, name: true } });
  const centerIds = centers.map((c) => c.id);

  const registrations = await prisma.competitionEnrollment.findMany({ where: { tenantId: req.auth.tenantId, competitionId, isActive: true, student: { hierarchyNodeId: { in: centerIds } } }, select: { student: { select: { id: true, firstName: true, lastName: true, currentTeacherUserId: true, hierarchyNodeId: true, isTemporaryExam: true } }, levelId: true, enrolledAt: true } });

  const levelSummary = {};
  const teacherMap = new Map();
  for (const r of registrations) {
    levelSummary[r.levelId] = (levelSummary[r.levelId] || 0) + 1;
    if (r.student.currentTeacherUserId) {
      teacherMap.set(r.student.currentTeacherUserId, (teacherMap.get(r.student.currentTeacherUserId) || 0) + 1);
    }
  }

  const tempStudents = registrations.filter((r) => r.student.isTemporaryExam).map((r) => r.student);

  const submissions = await prisma.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds } } });

  return res.apiSuccess("BP franchise detail fetched", { centers, registrations, levelSummary, teachers: Array.from(teacherMap.entries()).map(([teacherId, count]) => ({ teacherId, count })), temporaryStudents: tempStudents, submissions });
});

const returnBpCompetitionFranchise = asyncHandler(async (req, res) => {
  const { competitionId, franchiseId } = req.params;
  const { remark } = req.body;

  if (!remark || !String(remark).trim()) {
    return res.apiError(400, "remark is required", "VALIDATION_ERROR");
  }

  // Find centers under franchise
  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: franchiseId }, select: { id: true } });
  const centerIds = centers.map((c) => c.id);

  const created = [];
  await prisma.$transaction(async (tx) => {
    for (const centerId of centerIds) {
      const s = await tx.competitionCenterSubmission.create({ data: { tenantId: req.auth.tenantId, competitionId, centerId, status: "REOPENED", remark: String(remark).trim(), submittedByUserId: req.auth.userId } });
      created.push(s);
    }

    await tx.competitionStageTransition.create({ data: { tenantId: req.auth.tenantId, competitionId, fromStage: "BUSINESS_PARTNER_REVIEW", toStage: "FRANCHISE_RETURNED", action: "REJECT", reason: remark || null, actedByUserId: req.auth.userId } });
  });

  return res.apiSuccess("Franchise returned to franchise for edits", created);
});

const approveBpCompetitionFranchise = asyncHandler(async (req, res) => {
  const { competitionId, franchiseId } = req.params;

  const centers = await prisma.centerProfile.findMany({ where: { tenantId: req.auth.tenantId, franchiseProfileId: franchiseId }, select: { id: true } });
  const centerIds = centers.map((c) => c.id);

  const created = [];
  await prisma.$transaction(async (tx) => {
    // Approve centers that have SUBMITTED status
    const submittedCenters = await tx.competitionCenterSubmission.findMany({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds }, status: "SUBMITTED" }, select: { centerId: true } });
    const toApprove = Array.from(new Set(submittedCenters.map((s) => s.centerId)));

    for (const centerId of toApprove) {
      const s = await tx.competitionCenterSubmission.create({ data: { tenantId: req.auth.tenantId, competitionId, centerId, status: "APPROVED", submittedByUserId: req.auth.userId } });
      created.push(s);
    }

    await tx.competitionStageTransition.create({ data: { tenantId: req.auth.tenantId, competitionId, fromStage: "BUSINESS_PARTNER_REVIEW", toStage: "FRANCHISE_APPROVED", action: "FORWARD", reason: null, actedByUserId: req.auth.userId } });
  });

  return res.apiSuccess("Franchise approved by business partner", created);
});

const submitBpCompetition = asyncHandler(async (req, res) => {
  const { competitionId } = req.params;

  const bpScope = req.bpScope || {};
  const centerIds = bpScope.centerIds || [];

  // Ensure there are no pending SUBMITTED centers in scope
  const pending = await prisma.competitionCenterSubmission.findFirst({ where: { tenantId: req.auth.tenantId, competitionId, centerId: { in: centerIds }, status: "SUBMITTED" } });
  if (pending) {
    return res.apiError(409, "Not all franchises are approved", "FRANCHISES_PENDING_APPROVAL");
  }

  const updated = await prisma.competition.update({ where: { id: competitionId }, data: { workflowStage: "SUPERADMIN_APPROVAL" } });

  await prisma.competitionStageTransition.create({ data: { tenantId: req.auth.tenantId, competitionId, fromStage: "BP_REVIEW", toStage: "SUPERADMIN_APPROVAL", action: "FORWARD", reason: null, actedByUserId: req.auth.userId } });

  return res.apiSuccess("Business partner submitted competition to super admin", updated);
});

export {
  listBpCompetitionFranchises,
  getBpCompetitionFranchiseDetail,
  returnBpCompetitionFranchise,
  approveBpCompetitionFranchise,
  submitBpCompetition
};
