import { asyncHandler } from "../utils/async-handler.js";
import {
  getCenterIntelligence,
  getNetworkPulse,
  getCenterHealthScore,
  getTeacherWorkload,
  getAttendanceAnomalies,
  getFeeCollectionPulse,
} from "../services/leadership-intel.service.js";

// ── Center role endpoints ───────────────────────────────────────────
const getCenterIntel = asyncHandler(async (req, res) => {
  const data = await getCenterIntelligence(req.auth.tenantId, req.auth.hierarchyNodeId);
  res.json({ data });
});

const getCenterHealth = asyncHandler(async (req, res) => {
  const data = await getCenterHealthScore(req.auth.tenantId, req.auth.hierarchyNodeId);
  res.json({ data });
});

const getCenterTeacherWorkload = asyncHandler(async (req, res) => {
  const data = await getTeacherWorkload(req.auth.tenantId, req.auth.hierarchyNodeId);
  res.json({ data });
});

const getCenterAnomalies = asyncHandler(async (req, res) => {
  const data = await getAttendanceAnomalies(req.auth.tenantId, req.auth.hierarchyNodeId);
  res.json({ data });
});

const getCenterFeePulse = asyncHandler(async (req, res) => {
  const data = await getFeeCollectionPulse(req.auth.tenantId, req.auth.hierarchyNodeId);
  res.json({ data });
});

// ── Franchise role endpoints ────────────────────────────────────────
const getFranchiseNetworkPulse = asyncHandler(async (req, res) => {
  const nodeIds = req.franchiseScope?.hierarchyNodeIds || [];
  const data = await getNetworkPulse(req.auth.tenantId, nodeIds);
  res.json({ data });
});

// ── BP role endpoints ───────────────────────────────────────────────
const getBpNetworkPulse = asyncHandler(async (req, res) => {
  const nodeIds = req.bpScope?.hierarchyNodeIds || [];
  const data = await getNetworkPulse(req.auth.tenantId, nodeIds);
  res.json({ data });
});

// ── Superadmin endpoint ─────────────────────────────────────────────
const getSuperadminNetworkPulse = asyncHandler(async (req, res) => {
  // Superadmin sees all center nodes
  const centers = await (await import("../lib/prisma.js")).prisma.authUser.findMany({
    where: { tenantId: req.auth.tenantId, role: "CENTER", isActive: true, hierarchyNodeId: { not: null } },
    select: { hierarchyNodeId: true },
  });
  const nodeIds = [...new Set(centers.map((center) => center.hierarchyNodeId).filter(Boolean))];
  const data = await getNetworkPulse(req.auth.tenantId, nodeIds);
  res.json({ data });
});

export {
  getCenterIntel,
  getCenterHealth,
  getCenterTeacherWorkload,
  getCenterAnomalies,
  getCenterFeePulse,
  getFranchiseNetworkPulse,
  getBpNetworkPulse,
  getSuperadminNetworkPulse,
};
