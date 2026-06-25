import { apiClient } from "./apiClient";

function normalizeParams(params = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
}

async function requestReport(path, params = {}, config = {}) {
  const response = await apiClient.get(path, {
    ...config,
    params: normalizeParams(params)
  });
  return response.data;
}

async function requestReportBlob(path, params = {}, config = {}) {
  return apiClient.get(path, {
    ...config,
    params: normalizeParams(params),
    responseType: "blob",
    _skipGlobalLoading: config._skipGlobalLoading ?? true,
    _suppressErrorLogging: config._suppressErrorLogging ?? false
  });
}

function getBusinessPartnerFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/bp", params, config);
}

function getFranchiseFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/franchise", params, config);
}

function getCenterFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/center", params, config);
}

function getTeacherFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/teacher", params, config);
}

function getStudentFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/student", params, config);
}

function getParentFoundationReport(params = {}, config = {}) {
  return requestReport("/reports/parent", params, config);
}

function getGovernanceAuditSummaryReport(params = {}, config = {}) {
  return requestReport("/reports/audit", params, config);
}

function getWorkflowLifecycleSummaryReport(params = {}, config = {}) {
  return requestReport("/reports/audit/workflow-summary", params, config);
}

function getPrintableReport(reportKey, params = {}, config = {}) {
  return requestReport(`/reports/printable/${reportKey}`, params, config);
}

function exportReportPdf(reportKey, params = {}, config = {}) {
  return requestReport("/reports/export/pdf", { ...params, reportKey }, config);
}

function exportReportExcel(reportKey, params = {}, config = {}) {
  return requestReport("/reports/export/excel", { ...params, reportKey }, config);
}

function getReportExportJobs(params = {}, config = {}) {
  return requestReport("/reports/exports/jobs", params, config);
}

function getReportExportJob(jobId, config = {}) {
  return requestReport(`/reports/exports/jobs/${jobId}`, {}, config);
}

function retryReportExportJob(jobId, config = {}) {
  return apiClient.post(`/reports/exports/jobs/${jobId}/retry`, null, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function downloadReportExportJobArtifact(jobId, config = {}) {
  return requestReportBlob(`/reports/exports/jobs/${jobId}/download`, {}, config);
}

function getReportExportOperationsSummary(config = {}) {
  return requestReport("/reports/exports/operations/summary", {}, config);
}

function getReportExportOperationsDashboard(params = {}, config = {}) {
  return requestReport("/reports/exports/operations/dashboard", params, config);
}

function getReportExportCertificationReport(params = {}, config = {}) {
  return requestReport("/reports/exports/operations/certification/report", params, config);
}

function getProductionReadinessDashboard(params = {}, config = {}) {
  return requestReport("/reports/exports/operations/production/dashboard", params, config);
}

function getProductionRuntimeDiagnostics(params = {}, config = {}) {
  return requestReport("/reports/exports/operations/production/diagnostics", params, config);
}

function runReportExportCertificationScenario(scenarioKey, data = {}, config = {}) {
  return apiClient.post(`/reports/exports/operations/certification/scenarios/${scenarioKey}/run`, data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function recoverStalledReportExportJobs(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/recovery/stale-processing", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function runReportExportCleanup(config = {}) {
  return apiClient.post("/reports/exports/operations/recovery/cleanup", null, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function reconcileReportExportState(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/recovery/reconcile", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function stageDeploymentRelease(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/production/deployments/stage", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function advanceDeploymentRelease(releaseId, data = {}, config = {}) {
  return apiClient.post(`/reports/exports/operations/production/deployments/${releaseId}/advance`, data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function rollbackDeploymentRelease(releaseId, data = {}, config = {}) {
  return apiClient.post(`/reports/exports/operations/production/deployments/${releaseId}/rollback`, data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function recordBackupSnapshot(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/production/backups/record", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function validateBackupRestoreReadiness(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/production/backups/restore/validate", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function runProductionRecoveryDrill(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/production/recovery/drill", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function runProductionFailoverCertification(data = {}, config = {}) {
  return apiClient.post("/reports/exports/operations/production/failover/certify", data, {
    ...config,
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function queueReportExportSimulation(format, reportKey, data = {}, params = {}, config = {}) {
  return apiClient.post(`/reports/exports/operations/simulations/${format}/${reportKey}`, data, {
    ...config,
    params: normalizeParams(params),
    _skipGlobalLoading: config._skipGlobalLoading ?? true
  }).then((response) => response.data);
}

function buildPrintableReportPath(reportKey, params = {}) {
  const search = new URLSearchParams(normalizeParams(params)).toString();
  return `/reports/printable/${reportKey}${search ? `?${search}` : ""}`;
}

export {
  buildPrintableReportPath,
  downloadReportExportJobArtifact,
  exportReportExcel,
  exportReportPdf,
  getProductionReadinessDashboard,
  getProductionRuntimeDiagnostics,
  getBusinessPartnerFoundationReport,
  getCenterFoundationReport,
  getReportExportJob,
  getReportExportJobs,
  getReportExportCertificationReport,
  getReportExportOperationsDashboard,
  getReportExportOperationsSummary,
  getFranchiseFoundationReport,
  getGovernanceAuditSummaryReport,
  getParentFoundationReport,
  getPrintableReport,
  getStudentFoundationReport,
  getTeacherFoundationReport,
  getWorkflowLifecycleSummaryReport,
  advanceDeploymentRelease,
  recordBackupSnapshot,
  queueReportExportSimulation,
  reconcileReportExportState,
  recoverStalledReportExportJobs,
  rollbackDeploymentRelease,
  runProductionFailoverCertification,
  runProductionRecoveryDrill,
  runReportExportCertificationScenario,
  runReportExportCleanup,
  stageDeploymentRelease,
  validateBackupRestoreReadiness,
  retryReportExportJob
};