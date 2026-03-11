import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import {
  getTeacherCockpit,
  getAtRiskQueue,
  getBatchHeatmap,
  getWorksheetRecommendations,
  getInterventionSuggestions,
} from "../services/teacher-cockpit.service.js";

async function loadTeacher(req) {
  const teacher = await prisma.authUser.findFirst({
    where: { id: req.auth.userId, tenantId: req.auth.tenantId, role: "TEACHER", isActive: true },
    select: { id: true, hierarchyNodeId: true },
  });
  if (!teacher) throw Object.assign(new Error("Teacher not found"), { status: 404 });
  return teacher;
}

const getCockpitDashboard = asyncHandler(async (req, res) => {
  const teacher = await loadTeacher(req);
  const data = await getTeacherCockpit(
    req.auth.userId,
    req.auth.tenantId,
    teacher.hierarchyNodeId
  );
  res.json({ data });
});

const getAtRisk = asyncHandler(async (req, res) => {
  const teacher = await loadTeacher(req);
  const data = await getAtRiskQueue(
    req.auth.userId,
    req.auth.tenantId,
    teacher.hierarchyNodeId
  );
  res.json({ data });
});

const getBatches = asyncHandler(async (req, res) => {
  const teacher = await loadTeacher(req);
  const data = await getBatchHeatmap(
    req.auth.userId,
    req.auth.tenantId,
    teacher.hierarchyNodeId
  );
  res.json({ data });
});

const getRecommendations = asyncHandler(async (req, res) => {
  const teacher = await loadTeacher(req);
  const data = await getWorksheetRecommendations(
    req.auth.userId,
    req.auth.tenantId,
    teacher.hierarchyNodeId
  );
  res.json({ data });
});

const getInterventions = asyncHandler(async (req, res) => {
  const teacher = await loadTeacher(req);
  const data = await getInterventionSuggestions(
    req.auth.userId,
    req.auth.tenantId,
    teacher.hierarchyNodeId
  );
  res.json({ data });
});

export {
  getCockpitDashboard,
  getAtRisk,
  getBatches,
  getRecommendations,
  getInterventions,
};
