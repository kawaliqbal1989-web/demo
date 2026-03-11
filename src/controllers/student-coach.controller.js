import { asyncHandler } from "../utils/async-handler.js";
import {
  getCoachDashboard,
  generateDailyMission,
  generateWeeklyPlan,
  computeReadiness,
  explainPerformance,
} from "../services/student-coach.service.js";

const getCoachData = asyncHandler(async (req, res) => {
  const data = await getCoachDashboard(
    req.student.id,
    req.auth.tenantId,
    req.student.levelId
  );
  res.json({ data });
});

const getDailyMission = asyncHandler(async (req, res) => {
  const missions = await generateDailyMission(
    req.student.id,
    req.auth.tenantId,
    req.student.levelId
  );
  res.json({ data: missions });
});

const getWeeklyPlan = asyncHandler(async (req, res) => {
  const plan = await generateWeeklyPlan(
    req.student.id,
    req.auth.tenantId,
    req.student.levelId
  );
  res.json({ data: plan });
});

const getReadiness = asyncHandler(async (req, res) => {
  const readiness = await computeReadiness(
    req.student.id,
    req.auth.tenantId,
    req.student.levelId
  );
  res.json({ data: readiness });
});

const getPerformanceExplainer = asyncHandler(async (req, res) => {
  const explanation = await explainPerformance(
    req.student.id,
    req.auth.tenantId,
    req.student.levelId
  );
  res.json({ data: explanation });
});

export {
  getCoachData,
  getDailyMission,
  getWeeklyPlan,
  getReadiness,
  getPerformanceExplainer,
};
