import { asyncHandler } from "../utils/async-handler.js";
import {
  getFranchiseDashboardAnomalies,
  getFranchiseDashboardCenterHealth,
  getFranchiseDashboardOverview,
  getFranchiseDashboardTeacherOps,
  getFranchiseDashboardTrends
} from "../services/franchise-dashboard.service.js";

function buildScope(req) {
  return {
    tenantId: req.auth?.tenantId,
    franchiseScope: req.franchiseScope
  };
}

const getFranchiseOperationalOverview = asyncHandler(async (req, res) => {
  const { tenantId, franchiseScope } = buildScope(req);
  const data = await getFranchiseDashboardOverview({
    tenantId,
    franchiseScope,
    query: req.query
  });

  return res.apiSuccess("Franchise operational overview fetched", data);
});

const getFranchiseCenterHealthDashboard = asyncHandler(async (req, res) => {
  const { tenantId, franchiseScope } = buildScope(req);
  const data = await getFranchiseDashboardCenterHealth({
    tenantId,
    franchiseScope,
    query: req.query
  });

  return res.apiSuccess("Franchise center health fetched", data);
});

const getFranchiseTeacherOperations = asyncHandler(async (req, res) => {
  const { tenantId, franchiseScope } = buildScope(req);
  const data = await getFranchiseDashboardTeacherOps({
    tenantId,
    franchiseScope,
    query: req.query
  });

  return res.apiSuccess("Franchise teacher operations fetched", data);
});

const getFranchiseOperationalAnomalies = asyncHandler(async (req, res) => {
  const { tenantId, franchiseScope } = buildScope(req);
  const data = await getFranchiseDashboardAnomalies({
    tenantId,
    franchiseScope,
    query: req.query
  });

  return res.apiSuccess("Franchise operational anomalies fetched", data);
});

const getFranchiseOperationalTrends = asyncHandler(async (req, res) => {
  const { tenantId, franchiseScope } = buildScope(req);
  const data = await getFranchiseDashboardTrends({
    tenantId,
    franchiseScope,
    query: req.query
  });

  return res.apiSuccess("Franchise operational trends fetched", data);
});

export {
  getFranchiseCenterHealthDashboard,
  getFranchiseOperationalAnomalies,
  getFranchiseOperationalOverview,
  getFranchiseOperationalTrends,
  getFranchiseTeacherOperations
};