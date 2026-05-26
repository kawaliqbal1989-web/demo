import { asyncHandler } from "../utils/async-handler.js";
import { getTeacherFinancialVisibility } from "../services/financial-visibility.service.js";
import {
  getTeacherDashboardAnomalies,
  getTeacherDashboardAttendanceProductivity,
  getTeacherDashboardGradingProductivity,
  getTeacherDashboardOverview,
  getTeacherDashboardTaskQueue,
  getTeacherDashboardTrends
} from "../services/teacher-dashboard.service.js";

function extractTeacherScope(req) {
  const tenantId = req.auth?.tenantId;
  const authUserId = req.auth?.userId;
  const hierarchyNodeId = req.auth?.hierarchyNodeId;
  if (!tenantId || !authUserId) {
    return null;
  }

  return {
    tenantId,
    authUserId,
    hierarchyNodeId
  };
}

function createTeacherDashboardHandler(loader, successMessage) {
  return asyncHandler(async (req, res) => {
    const scope = extractTeacherScope(req);
    if (!scope) {
      return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
    }

    const result = await loader({
      ...scope,
      query: req.query
    });

    return res.apiSuccess(successMessage, result);
  });
}

const getTeacherDashboardOverviewController = createTeacherDashboardHandler(
  getTeacherDashboardOverview,
  "Teacher operational overview fetched"
);

const getTeacherDashboardAttendanceProductivityController = createTeacherDashboardHandler(
  getTeacherDashboardAttendanceProductivity,
  "Teacher attendance productivity fetched"
);

const getTeacherDashboardGradingProductivityController = createTeacherDashboardHandler(
  getTeacherDashboardGradingProductivity,
  "Teacher grading productivity fetched"
);

const getTeacherDashboardTaskQueueController = createTeacherDashboardHandler(
  getTeacherDashboardTaskQueue,
  "Teacher operational task queue fetched"
);

const getTeacherDashboardAnomaliesController = createTeacherDashboardHandler(
  getTeacherDashboardAnomalies,
  "Teacher operational anomalies fetched"
);

const getTeacherDashboardTrendsController = createTeacherDashboardHandler(
  getTeacherDashboardTrends,
  "Teacher operational trends fetched"
);

const getTeacherFinancialOverviewController = asyncHandler(async (req, res) => {
  const scope = extractTeacherScope(req);
  if (!scope) {
    return res.apiError(400, "Teacher scope missing", "TEACHER_SCOPE_REQUIRED");
  }

  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const result = await getTeacherFinancialVisibility({
    tenantId: scope.tenantId,
    teacherUserId: scope.authUserId,
    hierarchyNodeId: scope.hierarchyNodeId,
    limit,
    offset
  });

  return res.apiSuccess("Teacher financial overview fetched", result);
});

export {
  getTeacherDashboardOverviewController,
  getTeacherDashboardAttendanceProductivityController,
  getTeacherDashboardGradingProductivityController,
  getTeacherDashboardTaskQueueController,
  getTeacherDashboardAnomaliesController,
  getTeacherDashboardTrendsController,
  getTeacherFinancialOverviewController
};