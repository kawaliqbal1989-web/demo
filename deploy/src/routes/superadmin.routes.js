import { Router } from "express";
import {
  createSuperadmin,
  getKpis,
  listSuperadmins,
  recordDashboardAction,
  updateUserRole,
  listUsersByRole,
  getHierarchyTree,
  getHierarchyDashboard,
  getSystemHealth,
  saCreateFranchise,
  saSetFranchiseStatus,
  saGetFranchiseDetail,
  saCreateCenter,
  saSetCenterStatus,
  saGetCenterDetail
} from "../controllers/superadmin.controller.js";
import {
  listSuperadminCertificates,
  revokeSuperadminCertificate,
  exportSuperadminCertificatesCsv,
  getSuperadminBpCertificateTemplate,
  updateSuperadminBpCertificateTemplate
} from "../controllers/superadmin-certificates.controller.js";
import { requireSuperadmin } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { kpiRateLimiter } from "../middleware/kpi-rate-limit.js";

const superadminRouter = Router();

superadminRouter.get("/", requireSuperadmin(), listSuperadmins);
superadminRouter.get("/users", requireSuperadmin(), listUsersByRole);

superadminRouter.get(
  "/kpis",
  requireSuperadmin(),
  kpiRateLimiter,
  auditAction("VIEW_SUPERADMIN_KPIS", "DASHBOARD"),
  getKpis
);

superadminRouter.post(
  "/dashboard/actions",
  requireSuperadmin(),
  auditAction("SUPERADMIN_DASHBOARD_ACTION", "DASHBOARD"),
  recordDashboardAction
);
superadminRouter.post(
  "/",
  requireSuperadmin(),
  auditAction("CREATE_SUPERADMIN", "SUPERADMIN"),
  createSuperadmin
);

superadminRouter.patch(
  "/:id/role",
  requireSuperadmin(),
  auditAction("ROLE_UPDATE", "AUTH_USER", (req) => req.params.id),
  updateUserRole
);

// Hierarchy Monitor
superadminRouter.get(
  "/hierarchy-tree",
  requireSuperadmin(),
  auditAction("VIEW_HIERARCHY_TREE", "DASHBOARD"),
  getHierarchyTree
);

superadminRouter.get(
  "/hierarchy-dashboard",
  requireSuperadmin(),
  auditAction("VIEW_HIERARCHY_DASHBOARD", "DASHBOARD"),
  getHierarchyDashboard
);

superadminRouter.get(
  "/system-health",
  requireSuperadmin(),
  auditAction("VIEW_SYSTEM_HEALTH", "DASHBOARD"),
  getSystemHealth
);

// Certificate oversight
superadminRouter.get(
  "/certificates",
  requireSuperadmin(),
  auditAction("SA_VIEW_CERTIFICATES", "CERTIFICATE"),
  listSuperadminCertificates
);

superadminRouter.get(
  "/certificates/export.csv",
  requireSuperadmin(),
  auditAction("SA_EXPORT_CERTIFICATES", "CERTIFICATE"),
  exportSuperadminCertificatesCsv
);

superadminRouter.patch(
  "/certificates/:id/revoke",
  requireSuperadmin(),
  auditAction("SA_REVOKE_CERTIFICATE", "CERTIFICATE", (req) => req.params.id),
  revokeSuperadminCertificate
);

superadminRouter.get(
  "/business-partners/:bpId/certificate-template",
  requireSuperadmin(),
  auditAction("SA_VIEW_BP_CERT_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  getSuperadminBpCertificateTemplate
);

superadminRouter.put(
  "/business-partners/:bpId/certificate-template",
  requireSuperadmin(),
  auditAction("SA_UPDATE_BP_CERT_TEMPLATE", "CERTIFICATE_TEMPLATE"),
  updateSuperadminBpCertificateTemplate
);

// Hierarchy Management – Franchise
superadminRouter.post(
  "/franchises",
  requireSuperadmin(),
  auditAction("SA_CREATE_FRANCHISE", "FRANCHISE_PROFILE"),
  saCreateFranchise
);
superadminRouter.patch(
  "/franchises/:id/status",
  requireSuperadmin(),
  auditAction("SA_SET_FRANCHISE_STATUS", "FRANCHISE_PROFILE", (req) => req.params.id),
  saSetFranchiseStatus
);
superadminRouter.get(
  "/franchises/:id",
  requireSuperadmin(),
  auditAction("SA_VIEW_FRANCHISE_DETAIL", "FRANCHISE_PROFILE", (req) => req.params.id),
  saGetFranchiseDetail
);

// Hierarchy Management – Center
superadminRouter.post(
  "/centers",
  requireSuperadmin(),
  auditAction("SA_CREATE_CENTER", "CENTER_PROFILE"),
  saCreateCenter
);
superadminRouter.patch(
  "/centers/:id/status",
  requireSuperadmin(),
  auditAction("SA_SET_CENTER_STATUS", "CENTER_PROFILE", (req) => req.params.id),
  saSetCenterStatus
);
superadminRouter.get(
  "/centers/:id",
  requireSuperadmin(),
  auditAction("SA_VIEW_CENTER_DETAIL", "CENTER_PROFILE", (req) => req.params.id),
  saGetCenterDetail
);

/* ── Intelligence ── */
import { getSuperadminNetworkPulse } from "../controllers/leadership-intel.controller.js";
import { getSuperadminAiNarrative, getAiNarrativeStats } from "../controllers/ai-narrative.controller.js";
import { handleGetInsightAnalytics, handleGetPlaygroundAnalytics, handleGetAiDashboard } from "../controllers/recommendation-analytics.controller.js";

import {
  handleGetWaveStatus,
  handleGetFeatureStatus,
  handleToggleWave,
  handleGetDeployInfo,
  handleGetMigrationSequence,
} from "../controllers/release-management.controller.js";

superadminRouter.get("/intel/network-pulse", requireSuperadmin(), getSuperadminNetworkPulse);

/* ── AI Narrative (Phase 10) ── */
superadminRouter.get("/ai/narrative", requireSuperadmin(), getSuperadminAiNarrative);
superadminRouter.get("/ai/stats", requireSuperadmin(), getAiNarrativeStats);

/* ── Recommendation Analytics (Phase 11) ── */
superadminRouter.get("/analytics/insights", requireSuperadmin(), handleGetInsightAnalytics);
superadminRouter.get("/analytics/ai-playground", requireSuperadmin(), handleGetPlaygroundAnalytics);
superadminRouter.get("/analytics/ai-dashboard", requireSuperadmin(), handleGetAiDashboard);

/* ── Release Management (Phase 12) ── */
superadminRouter.get("/release/waves", requireSuperadmin(), handleGetWaveStatus);
superadminRouter.get("/release/features", requireSuperadmin(), handleGetFeatureStatus);
superadminRouter.patch("/release/waves/:waveKey", requireSuperadmin(), handleToggleWave);
superadminRouter.get("/release/deploy-info", requireSuperadmin(), handleGetDeployInfo);
superadminRouter.get("/release/migrations", requireSuperadmin(), handleGetMigrationSequence);

export { superadminRouter };
