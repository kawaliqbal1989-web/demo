import { asyncHandler } from "../utils/async-handler.js";
import {
  getCenterDashboardAnomalies,
  getCenterDashboardAttendanceHealth,
  getCenterDashboardBatchHealth,
  getCenterDashboardOverview,
  getCenterDashboardTeacherOps,
  getCenterDashboardTrends,
  getCenterDashboardWorksheetOps
} from "../services/center-dashboard.service.js";

function buildScope(req) {
  return {
    tenantId: req.auth?.tenantId,
    authUserId: req.auth?.userId,
    hierarchyNodeId: req.auth?.hierarchyNodeId
  };
}

const getCenterOperationalOverview = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardOverview({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center operational overview fetched", data);
});

const getCenterAttendanceHealthDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardAttendanceHealth({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center attendance health fetched", data);
});

const getCenterWorksheetOperationsDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardWorksheetOps({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center worksheet operations fetched", data);
});

const getCenterTeacherOperationsDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardTeacherOps({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center teacher operations fetched", data);
});

const getCenterBatchHealthDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardBatchHealth({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center batch health fetched", data);
});

const getCenterOperationalAnomaliesDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardAnomalies({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center operational anomalies fetched", data);
});

const getCenterOperationalTrendsDashboard = asyncHandler(async (req, res) => {
  const data = await getCenterDashboardTrends({
    ...buildScope(req),
    query: req.query
  });

  return res.apiSuccess("Center operational trends fetched", data);
});

export {
  getCenterAttendanceHealthDashboard,
  getCenterBatchHealthDashboard,
  getCenterOperationalAnomaliesDashboard,
  getCenterOperationalOverview,
  getCenterOperationalTrendsDashboard,
  getCenterTeacherOperationsDashboard,
  getCenterWorksheetOperationsDashboard
};