import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { MetricCard } from "../../components/MetricCard";
import { PageHeader } from "../../components/PageHeader";
import {
  advanceDeploymentRelease,
  getProductionReadinessDashboard,
  getReportExportCertificationReport,
  getReportExportOperationsDashboard,
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
  validateBackupRestoreReadiness
} from "../../services/reportingFoundationService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) {
    return "0s";
  }

  if (value >= 60 * 60 * 1000) {
    return `${(value / (60 * 60 * 1000)).toFixed(1)}h`;
  }

  if (value >= 60 * 1000) {
    return `${Math.round(value / (60 * 1000))}m`;
  }

  return `${Math.round(value / 1000)}s`;
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) {
    return "0";
  }
  return String(Math.max(0, Math.round(score)));
}

function formatSeverity(value) {
  const normalized = String(value || "info").toLowerCase();
  if (normalized === "critical") {
    return "Critical";
  }
  if (normalized === "warning") {
    return "Warning";
  }
  return "Info";
}

function buildBackupSnapshotLabel(environment, currentDate = new Date()) {
  const normalizedEnvironment = String(environment || "production").trim().toLowerCase() || "production";
  const isoMinute = currentDate.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
  return `${normalizedEnvironment}-${isoMinute}`;
}

function StatusPill({ value, tone = "neutral" }) {
  const tones = {
    critical: { background: "var(--color-bg-danger-light)", color: "var(--color-text-danger)" },
    warning: { background: "var(--color-bg-warn-light)", color: "var(--color-text-warning)" },
    success: { background: "var(--color-bg-success-light)", color: "var(--color-text-success)" },
    neutral: { background: "var(--color-bg-muted)", color: "var(--color-text-primary)" }
  };
  const palette = tones[tone] || tones.neutral;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "4px 10px",
        fontSize: 12,
        fontWeight: 700,
        background: palette.background,
        color: palette.color
      }}
    >
      {value}
    </span>
  );
}

function MiniBarChart({ title, items = [], formatter = (value) => String(value) }) {
  const maxValue = Math.max(1, ...items.map((item) => Number(item?.value) || 0));

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {items.length ? items.map((item) => (
        <div key={`${title}-${item.label}-${item.startAt || ""}`} style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
            <span>{item.label}</span>
            <span>{formatter(item.value)}</span>
          </div>
          <div style={{ height: 10, borderRadius: 999, background: "var(--color-bg-muted)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${Math.max(4, Math.round(((Number(item.value) || 0) / maxValue) * 100))}%`, background: "linear-gradient(90deg, var(--color-text-secondary) 0%, var(--color-primary) 100%)" }} />
          </div>
        </div>
      )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No data available.</div>}
    </div>
  );
}

function DistributionList({ title, items = {} }) {
  const entries = Object.entries(items || {}).sort((left, right) => Number(right[1]) - Number(left[1]));

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {entries.length ? entries.map(([label, value]) => (
        <div key={`${title}-${label}`} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "var(--color-text-primary)" }}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No distribution data available.</div>}
    </div>
  );
}

const CERTIFICATION_SCENARIOS = [
  { key: "large-dataset", label: "Large Dataset" },
  { key: "queue-saturation", label: "Queue Saturation" },
  { key: "retry-storm", label: "Retry Storm" },
  { key: "long-duration", label: "Long Duration" },
  { key: "recovery-certification", label: "Recovery Certification" }
];

function SuperadminExportOperationsPage() {
  const [windowHours, setWindowHours] = useState("24");
  const [recentLimit, setRecentLimit] = useState("12");
  const [dashboard, setDashboard] = useState(null);
  const [certificationReport, setCertificationReport] = useState(null);
  const [productionDashboard, setProductionDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [stagingReleaseBusy, setStagingReleaseBusy] = useState(false);
  const [advancingReleaseBusy, setAdvancingReleaseBusy] = useState(false);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupValidationBusy, setBackupValidationBusy] = useState(false);
  const [recoveryDrillBusy, setRecoveryDrillBusy] = useState(false);
  const [failoverBusy, setFailoverBusy] = useState(false);
  const [runningScenarioKey, setRunningScenarioKey] = useState("");
  const [simulationReportKey, setSimulationReportKey] = useState("governance-audit");
  const [simulationFormat, setSimulationFormat] = useState("XLSX");
  const [simulationCount, setSimulationCount] = useState("4");
  const [executeNow, setExecuteNow] = useState(true);
  const [releaseEnvironment, setReleaseEnvironment] = useState("production");
  const [releaseVersionTag, setReleaseVersionTag] = useState("");
  const [releaseBuildId, setReleaseBuildId] = useState("");
  const [releaseCommitSha, setReleaseCommitSha] = useState("");
  const [rollbackVersionTag, setRollbackVersionTag] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState("");
  const [releaseCheckpoint, setReleaseCheckpoint] = useState("PRECHECKS_PASSED");
  const [snapshotLabel, setSnapshotLabel] = useState(() => buildBackupSnapshotLabel("production"));
  const [snapshotReference, setSnapshotReference] = useState("");
  const [snapshotChecksum, setSnapshotChecksum] = useState("");
  const [backupRetentionDays, setBackupRetentionDays] = useState("14");
  const [backupIdInput, setBackupIdInput] = useState("");

  const load = async (override = {}) => {
    setLoading(true);
    setError("");
    try {
      const nextWindowHours = override.windowHours || windowHours;
      const nextRecentLimit = override.recentLimit || recentLimit;
      const [dashboardResponse, certificationResponse, productionResponse] = await Promise.all([
        getReportExportOperationsDashboard({
          windowHours: nextWindowHours,
          limit: nextRecentLimit
        }, {
          _skipGlobalLoading: true,
          _suppressErrorLogging: true
        }),
        getReportExportCertificationReport({
          windowHours: nextWindowHours
        }, {
          _skipGlobalLoading: true,
          _suppressErrorLogging: true
        }),
        getProductionReadinessDashboard({
          windowHours: nextWindowHours,
          limit: nextRecentLimit
        }, {
          _skipGlobalLoading: true,
          _suppressErrorLogging: true
        })
      ]);

      setDashboard(dashboardResponse?.data || null);
      setCertificationReport(certificationResponse?.data || null);
      setProductionDashboard(productionResponse?.data || null);
      setSelectedReleaseId((current) => current || productionResponse?.data?.deployments?.latest?.releaseId || "");
      setBackupIdInput((current) => current || productionResponse?.data?.backups?.latest?.backupId || "");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load export operations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const incidents = dashboard?.sla?.incidents || [];
  const recentJobs = dashboard?.recent?.jobs || [];
  const recentActivity = dashboard?.recent?.activity || [];
  const workerRows = dashboard?.workers?.active || [];
  const dueSoonSchedules = dashboard?.schedules?.dueSoon || [];
  const expiringSoonArtifacts = dashboard?.artifacts?.expiringSoon || [];
  const certificationRuns = certificationReport?.runs || [];
  const deploymentRows = productionDashboard?.deployments?.recent || [];
  const backupRows = productionDashboard?.backups?.recent || [];
  const recoveryRows = productionDashboard?.recovery?.recent || [];
  const failoverRows = productionDashboard?.failover?.recent || [];
  const securityChecks = productionDashboard?.security?.checks || [];
  const productionRecommendations = productionDashboard?.diagnostics?.recommendations || [];

  const certificationColumns = useMemo(() => ([
    {
      key: "passed",
      header: "Assessment",
      render: (row) => <StatusPill value={row.evaluation?.passed ? "Passed" : "Review"} tone={row.evaluation?.passed ? "success" : "warning"} />
    },
    { key: "scenarioKey", header: "Scenario" },
    {
      key: "queuedCount",
      header: "Queued",
      render: (row) => String(row.queuedCount || 0)
    },
    {
      key: "averageEndToEndMs",
      header: "Avg End-to-End",
      render: (row) => formatDuration(row.averageEndToEndMs || 0)
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => formatTimestamp(row.createdAt)
    }
  ]), []);

  const incidentColumns = useMemo(() => ([
    {
      key: "severity",
      header: "Severity",
      render: (row) => <StatusPill value={formatSeverity(row.severity)} tone={row.severity} />
    },
    { key: "type", header: "Type" },
    { key: "message", header: "Message" },
    { key: "reportKey", header: "Report" },
    {
      key: "detectedAt",
      header: "Detected",
      render: (row) => formatTimestamp(row.detectedAt)
    }
  ]), []);

  const jobColumns = useMemo(() => ([
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusPill value={row.status} tone={row.status === "FAILED" ? "critical" : row.status === "COMPLETED" ? "success" : "neutral"} />
    },
    { key: "reportKey", header: "Report" },
    { key: "exportFormat", header: "Format" },
    { key: "queueName", header: "Queue" },
    {
      key: "byteLength",
      header: "Size",
      render: (row) => formatBytes(row.byteLength)
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => formatTimestamp(row.updatedAt)
    }
  ]), []);

  const activityColumns = useMemo(() => ([
    {
      key: "createdAt",
      header: "Created",
      render: (row) => formatTimestamp(row.createdAt)
    },
    { key: "action", header: "Action" },
    { key: "role", header: "Role" },
    { key: "entityId", header: "Entity" },
    {
      key: "metadata",
      header: "Metadata",
      render: (row) => (
        <details>
          <summary style={{ cursor: "pointer", color: "#2563eb" }}>View</summary>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, paddingTop: 8, maxWidth: 520 }}>
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        </details>
      )
    }
  ]), []);

  const deploymentColumns = useMemo(() => ([
    {
      key: "currentCheckpoint",
      header: "Checkpoint",
      render: (row) => <StatusPill value={row.currentCheckpoint || "STAGED"} tone={row.currentCheckpoint === "COMPLETED" ? "success" : row.currentCheckpoint?.startsWith("ROLLBACK") ? "warning" : "neutral"} />
    },
    { key: "environment", header: "Env" },
    { key: "versionTag", header: "Version" },
    { key: "rollbackVersionTag", header: "Rollback" },
    {
      key: "healthValidation",
      header: "Readiness",
      render: (row) => <StatusPill value={row.healthValidation?.deploymentReady ? "Ready" : "Review"} tone={row.healthValidation?.deploymentReady ? "success" : "warning"} />
    },
    {
      key: "updatedAt",
      header: "Updated",
      render: (row) => formatTimestamp(row.updatedAt)
    }
  ]), []);

  const backupColumns = useMemo(() => ([
    { key: "environment", header: "Env" },
    { key: "snapshotLabel", header: "Snapshot" },
    {
      key: "integrity",
      header: "Integrity",
      render: (row) => <StatusPill value={row.integrity?.passed ? "Healthy" : "Issue"} tone={row.integrity?.passed ? "success" : "warning"} />
    },
    {
      key: "restoreValidation",
      header: "Restore"
      ,render: (row) => <StatusPill value={row.restoreValidation?.passed ? "Verified" : "Pending"} tone={row.restoreValidation?.passed ? "success" : "warning"} />
    },
    {
      key: "retentionUntil",
      header: "Retention Until",
      render: (row) => formatTimestamp(row.retentionUntil)
    }
  ]), []);

  const recoveryColumns = useMemo(() => ([
    {
      key: "dryRun",
      header: "Mode",
      render: (row) => <StatusPill value={row.dryRun ? "Dry Run" : "Executed"} tone={row.dryRun ? "warning" : "success"} />
    },
    {
      key: "continuityScore",
      header: "Continuity",
      render: (row) => `${formatScore(row.continuityScore)}/100`
    },
    {
      key: "replayQueued",
      header: "Replay Queued",
      render: (row) => String(row.replayQueued || 0)
    },
    {
      key: "missingArtifactFiles",
      header: "Missing Artifacts",
      render: (row) => String(row.missingArtifactFiles || 0)
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => formatTimestamp(row.createdAt)
    }
  ]), []);

  const failoverColumns = useMemo(() => ([
    {
      key: "passed",
      header: "Assessment",
      render: (row) => <StatusPill value={row.passed ? "Passed" : "Review"} tone={row.passed ? "success" : "warning"} />
    },
    {
      key: "continuityScore",
      header: "Score",
      render: (row) => `${formatScore(row.continuityScore)}/100`
    },
    {
      key: "rollbackReady",
      header: "Rollback Ready",
      render: (row) => <StatusPill value={row.rollbackReady ? "Ready" : "Missing"} tone={row.rollbackReady ? "success" : "warning"} />
    },
    {
      key: "interruptedJobs",
      header: "Interrupted",
      render: (row) => String(row.interruptedJobs || 0)
    },
    {
      key: "createdAt",
      header: "Created",
      render: (row) => formatTimestamp(row.createdAt)
    }
  ]), []);

  const handleRecover = async () => {
    setRecovering(true);
    try {
      const response = await recoverStalledReportExportJobs({ reason: "superadmin_operations_recovery", limit: 10 }, { _skipGlobalLoading: true });
      toast.success(`Recovered ${response?.data?.recoveredCount || 0} stalled export job(s).`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to recover stalled export jobs.");
    } finally {
      setRecovering(false);
    }
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const response = await runReportExportCleanup({ _skipGlobalLoading: true });
      toast.success(`Cleanup processed ${response?.data?.expired || 0} expired and ${response?.data?.deleted || 0} deleted artifact(s).`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to run export cleanup.");
    } finally {
      setCleaning(false);
    }
  };

  const handleReconcile = async (dryRun = true) => {
    setReconciling(true);
    try {
      const response = await reconcileReportExportState({ dryRun, limit: 10 }, { _skipGlobalLoading: true });
      const summary = response?.data || {};
      toast.success(
        dryRun
          ? `Reconciliation inspected ${summary.completedWithoutArtifact?.length || 0} missing-artifact job(s).`
          : `Reconciliation repaired ${summary.repairedJobs?.length || 0} job(s) and ${summary.fixedArtifacts?.length || 0} artifact(s).`
      );
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to reconcile export state.");
    } finally {
      setReconciling(false);
    }
  };

  const handleRunCertification = async (scenarioKey) => {
    setRunningScenarioKey(scenarioKey);
    try {
      const response = await runReportExportCertificationScenario(scenarioKey, { executeNow: true }, { _skipGlobalLoading: true });
      toast.success(`Queued ${response?.data?.queuedCount || 0} certification job(s) for ${scenarioKey}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to start certification scenario.");
    } finally {
      setRunningScenarioKey("");
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const response = await queueReportExportSimulation(
        simulationFormat,
        simulationReportKey,
        {
          count: simulationCount,
          executeNow,
          queueName: "simulation",
          priority: 25
        },
        {},
        { _skipGlobalLoading: true }
      );
      const queued = response?.data?.simulation?.count || 0;
      toast.success(`Queued ${queued} simulation export job(s).`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to queue simulation exports.");
    } finally {
      setSimulating(false);
    }
  };

  const handleStageRelease = async () => {
    const normalizedReleaseVersionTag = String(releaseVersionTag || "").trim();

    if (!normalizedReleaseVersionTag) {
      toast.error("Enter a release version before staging the deployment.");
      return;
    }

    setStagingReleaseBusy(true);
    try {
      setReleaseVersionTag(normalizedReleaseVersionTag);
      const response = await stageDeploymentRelease({
        environment: releaseEnvironment,
        versionTag: normalizedReleaseVersionTag,
        buildId: releaseBuildId,
        commitSha: releaseCommitSha,
        rollbackVersionTag
      }, { _skipGlobalLoading: true });
      const release = response?.data;
      setSelectedReleaseId(release?.releaseId || "");
      toast.success(`Staged release ${release?.versionTag || normalizedReleaseVersionTag}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to stage deployment release.");
    } finally {
      setStagingReleaseBusy(false);
    }
  };

  const handleAdvanceRelease = async () => {
    if (!selectedReleaseId) {
      toast.error("Select or enter a release ID first.");
      return;
    }

    setAdvancingReleaseBusy(true);
    try {
      await advanceDeploymentRelease(selectedReleaseId, {
        checkpoint: releaseCheckpoint
      }, { _skipGlobalLoading: true });
      toast.success(`Advanced release ${selectedReleaseId} to ${releaseCheckpoint}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to advance deployment release.");
    } finally {
      setAdvancingReleaseBusy(false);
    }
  };

  const handleRollbackRelease = async () => {
    if (!selectedReleaseId) {
      toast.error("Select or enter a release ID first.");
      return;
    }

    setRollbackBusy(true);
    try {
      await rollbackDeploymentRelease(selectedReleaseId, {
        rollbackVersionTag,
        rollbackReason: "operations_center_manual_rollback"
      }, { _skipGlobalLoading: true });
      toast.success(`Recorded rollback for ${selectedReleaseId}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to record deployment rollback.");
    } finally {
      setRollbackBusy(false);
    }
  };

  const handleRecordBackup = async () => {
    const normalizedSnapshotLabel = String(snapshotLabel || "").trim() || buildBackupSnapshotLabel(releaseEnvironment);

    setBackupBusy(true);
    try {
      setSnapshotLabel(normalizedSnapshotLabel);
      const response = await recordBackupSnapshot({
        environment: releaseEnvironment,
        snapshotLabel: normalizedSnapshotLabel,
        retentionDays: backupRetentionDays,
        database: {
          snapshotReference,
          checksum: snapshotChecksum
        },
        includeArtifacts: true
      }, { _skipGlobalLoading: true });
      const backup = response?.data;
      setBackupIdInput(backup?.backupId || "");
      toast.success(`Recorded backup ${backup?.snapshotLabel || normalizedSnapshotLabel}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to record backup snapshot.");
    } finally {
      setBackupBusy(false);
    }
  };

  const handleValidateBackup = async () => {
    setBackupValidationBusy(true);
    try {
      await validateBackupRestoreReadiness({
        backupId: backupIdInput || undefined,
        dryRun: true
      }, { _skipGlobalLoading: true });
      toast.success("Validated backup restore readiness.");
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to validate backup restore readiness.");
    } finally {
      setBackupValidationBusy(false);
    }
  };

  const handleRecoveryDrill = async (dryRun = true) => {
    setRecoveryDrillBusy(true);
    try {
      const response = await runProductionRecoveryDrill({
        dryRun,
        executeWorkerPass: !dryRun,
        executeCleanup: !dryRun
      }, { _skipGlobalLoading: true });
      toast.success(`${dryRun ? "Previewed" : "Executed"} recovery drill with score ${formatScore(response?.data?.continuityScore)}.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to run production recovery drill.");
    } finally {
      setRecoveryDrillBusy(false);
    }
  };

  const handleFailoverCertification = async (dryRun = true) => {
    setFailoverBusy(true);
    try {
      const response = await runProductionFailoverCertification({
        dryRun,
        executeRecovery: !dryRun
      }, { _skipGlobalLoading: true });
      toast.success(`${response?.data?.passed ? "Passed" : "Completed"} failover certification at ${formatScore(response?.data?.continuityScore)}/100.`);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to run failover certification.");
    } finally {
      setFailoverBusy(false);
    }
  };

  if (loading && !dashboard) {
    return <LoadingState label="Loading export operations..." />;
  }

  if (error && !dashboard) {
    return <ErrorState title="Export operations unavailable" message={error} />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader
        title="Export Operations"
        subtitle="Operational visibility, SLA governance, worker health, artifact lifecycle, and controlled recovery for background exports."
        actions={(
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => void load()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleRecover} disabled={recovering}>
              {recovering ? "Recovering..." : "Recover Stale Jobs"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleCleanup} disabled={cleaning}>
              {cleaning ? "Cleaning..." : "Run Cleanup"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => handleReconcile(true)} disabled={reconciling}>
              {reconciling ? "Reconciling..." : "Dry-Run Reconcile"}
            </button>
          </div>
        )}
      />

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Window (hours)</label>
            <input className="input" type="number" min={1} max={720} value={windowHours} onChange={(event) => setWindowHours(event.target.value)} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Recent rows</label>
            <input className="input" type="number" min={1} max={50} value={recentLimit} onChange={(event) => setRecentLimit(event.target.value)} />
          </div>
          <div style={{ display: "flex", alignItems: "end" }}>
            <button className="button" style={{ width: "auto" }} onClick={() => void load()} disabled={loading}>
              {loading ? "Loading..." : "Apply Window"}
            </button>
          </div>
        </div>
        {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Generated at {formatTimestamp(dashboard?.generatedAt)}. Queue SLA {formatDuration(dashboard?.thresholds?.queuedMs)}. Processing SLA {formatDuration(dashboard?.thresholds?.processingMs)}.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <MetricCard label="Queued Jobs" value={String(dashboard?.backlog?.statusCounts?.QUEUED || 0)} sublabel={`Oldest age ${formatDuration(dashboard?.backlog?.oldestQueuedAgeMs || 0)}`} />
        <MetricCard label="Processing Jobs" value={String(dashboard?.backlog?.statusCounts?.PROCESSING || 0)} sublabel={`${dashboard?.workers?.counts?.activeWorkers || 0} worker(s) active`} />
        <MetricCard label="Queued SLA Breaches" value={String(dashboard?.sla?.queuedBreaches || 0)} sublabel={`${dashboard?.sla?.processingBreaches || 0} processing breach(es)`} />
        <MetricCard label="Stale Processing Jobs" value={String(dashboard?.workers?.counts?.staleProcessingJobs || 0)} sublabel={`${dashboard?.workers?.counts?.staleWorkers || 0} stale worker(s)`} />
        <MetricCard label="Available Artifacts" value={String(dashboard?.artifacts?.availableCount || 0)} sublabel={formatBytes(dashboard?.artifacts?.availableBytes || 0)} />
        <MetricCard label="Completed In Window" value={String(dashboard?.throughput?.completedCount || 0)} sublabel={`Avg end-to-end ${formatDuration(dashboard?.throughput?.averageEndToEndMs || 0)}`} />
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Production Readiness</h3>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Deployment governance, backup and restore validation, disaster recovery drills, failover continuity scoring, and production security diagnostics on top of the certified export control plane.
          </p>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <MetricCard label="Readiness Score" value={formatScore(productionDashboard?.summary?.overallScore || 0)} sublabel={productionDashboard?.summary?.productionCertified ? "Production certified" : "Review required"} />
          <MetricCard label="Security Score" value={formatScore(productionDashboard?.security?.score || 0)} sublabel={productionDashboard?.security?.status || "UNKNOWN"} />
          <MetricCard label="Latest Failover" value={formatScore(productionDashboard?.failover?.latest?.continuityScore || 0)} sublabel={productionDashboard?.failover?.latest?.passed ? "Passed" : "Pending certification"} />
          <MetricCard label="Restore Validated" value={String(productionDashboard?.backups?.restoreValidatedCount || 0)} sublabel={`${productionDashboard?.backups?.integrityFailures || 0} integrity issue(s)`} />
          <MetricCard label="Recent Releases" value={String(deploymentRows.length)} sublabel={`${Object.keys(productionDashboard?.deployments?.countsByCheckpoint || {}).length} checkpoint bucket(s)`} />
          <MetricCard label="Repair Recommendations" value={String(productionRecommendations.length)} sublabel={`${productionDashboard?.summary?.queuedBreaches || 0} queued breach(es)`} />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Deployment Governance</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Environment</label>
              <select className="input" value={releaseEnvironment} onChange={(event) => setReleaseEnvironment(event.target.value)}>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Version</label>
              <input className="input" value={releaseVersionTag} onChange={(event) => setReleaseVersionTag(event.target.value)} placeholder="v1.2.3" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Build ID</label>
              <input className="input" value={releaseBuildId} onChange={(event) => setReleaseBuildId(event.target.value)} placeholder="build-20260512" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Commit</label>
              <input className="input" value={releaseCommitSha} onChange={(event) => setReleaseCommitSha(event.target.value)} placeholder="git sha" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rollback Version</label>
              <input className="input" value={rollbackVersionTag} onChange={(event) => setRollbackVersionTag(event.target.value)} placeholder="v1.2.2" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Release ID</label>
              <input className="input" value={selectedReleaseId} onChange={(event) => setSelectedReleaseId(event.target.value)} placeholder="release:production:v1-2-3:build" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Advance To</label>
              <select className="input" value={releaseCheckpoint} onChange={(event) => setReleaseCheckpoint(event.target.value)}>
                <option value="PRECHECKS_PASSED">Prechecks Passed</option>
                <option value="ROLLOUT_STARTED">Rollout Started</option>
                <option value="ROLLOUT_VERIFIED">Rollout Verified</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button" style={{ width: "auto" }} onClick={handleStageRelease} disabled={stagingReleaseBusy || !String(releaseVersionTag || "").trim()}>
              {stagingReleaseBusy ? "Staging..." : "Stage Release"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleAdvanceRelease} disabled={advancingReleaseBusy}>
              {advancingReleaseBusy ? "Advancing..." : "Advance Checkpoint"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleRollbackRelease} disabled={rollbackBusy}>
              {rollbackBusy ? "Rolling Back..." : "Record Rollback"}
            </button>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Backup + Restore</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Snapshot Label</label>
              <input className="input" value={snapshotLabel} onChange={(event) => setSnapshotLabel(event.target.value)} placeholder={buildBackupSnapshotLabel(releaseEnvironment)} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Snapshot Reference</label>
              <input className="input" value={snapshotReference} onChange={(event) => setSnapshotReference(event.target.value)} placeholder="db-snap-ref" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Checksum</label>
              <input className="input" value={snapshotChecksum} onChange={(event) => setSnapshotChecksum(event.target.value)} placeholder="sha256" />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Retention Days</label>
              <input className="input" type="number" min={1} max={365} value={backupRetentionDays} onChange={(event) => setBackupRetentionDays(event.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Backup ID</label>
            <input className="input" value={backupIdInput} onChange={(event) => setBackupIdInput(event.target.value)} placeholder="backup:production:nightly:*" />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button" style={{ width: "auto" }} onClick={handleRecordBackup} disabled={backupBusy}>
              {backupBusy ? "Recording..." : "Record Backup"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={handleValidateBackup} disabled={backupValidationBusy}>
              {backupValidationBusy ? "Validating..." : "Validate Restore"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Recovery + Failover</h3>
          <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 13 }}>
            Dry-run and execute deterministic recovery drills, queue rebuilds, replay-safe requeueing, and failover continuity scoring.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => handleRecoveryDrill(true)} disabled={recoveryDrillBusy}>
              {recoveryDrillBusy ? "Running..." : "Preview Recovery Drill"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => handleRecoveryDrill(false)} disabled={recoveryDrillBusy}>
              {recoveryDrillBusy ? "Running..." : "Execute Recovery Drill"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => handleFailoverCertification(true)} disabled={failoverBusy}>
              {failoverBusy ? "Running..." : "Preview Failover Cert"}
            </button>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => handleFailoverCertification(false)} disabled={failoverBusy}>
              {failoverBusy ? "Running..." : "Execute Failover Cert"}
            </button>
          </div>
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Security Diagnostics</h3>
          {securityChecks.length ? securityChecks.map((check) => (
            <div key={check.key} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--color-border-divider)" }}>
              <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{check.label}</span>
              <StatusPill value={check.passed ? "Pass" : "Review"} tone={check.passed ? "success" : check.severity === "critical" ? "critical" : "warning"} />
            </div>
          )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No security diagnostics available.</div>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <MiniBarChart title="Throughput" items={dashboard?.charts?.throughput || []} formatter={(value) => `${value}`} />
        <MiniBarChart title="Queue Saturation" items={dashboard?.charts?.saturation || []} formatter={(value) => `${value}`} />
        <MiniBarChart title="Worker Utilization" items={dashboard?.charts?.workerUtilization || []} formatter={(value) => `${value}m`} />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <DistributionList title="Duration Distribution" items={dashboard?.distributions?.duration || {}} />
        <DistributionList title="Retry Heatmap" items={Object.fromEntries(Object.entries(dashboard?.distributions?.retryHeatmap || {}).map(([key, value]) => [key, `${value.retried}/${value.total}`]))} />
        <DistributionList title="Activity Mix" items={dashboard?.distributions?.reportKeys || {}} />
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Scale Certification</h3>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Deterministic scenario runs for large datasets, saturation, retry storms, long-duration execution, and recovery certification on the existing export infrastructure.
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {CERTIFICATION_SCENARIOS.map((scenario) => (
            <button
              key={scenario.key}
              className="button secondary"
              style={{ width: "auto" }}
              onClick={() => handleRunCertification(scenario.key)}
              disabled={runningScenarioKey === scenario.key}
            >
              {runningScenarioKey === scenario.key ? "Running..." : scenario.label}
            </button>
          ))}
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleReconcile(false)} disabled={reconciling}>
            {reconciling ? "Reconciling..." : "Repair Export State"}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Simulation Controls</h3>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Queue controlled export batches to validate queue depth, worker throughput, and recovery behavior without changing route surfaces.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Report</label>
            <select className="input" value={simulationReportKey} onChange={(event) => setSimulationReportKey(event.target.value)}>
              <option value="governance-audit">Governance audit</option>
              <option value="workflow-lifecycle">Workflow lifecycle</option>
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Format</label>
            <select className="input" value={simulationFormat} onChange={(event) => setSimulationFormat(event.target.value)}>
              <option value="XLSX">XLSX</option>
              <option value="PDF">PDF</option>
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Jobs</label>
            <input className="input" type="number" min={1} max={12} value={simulationCount} onChange={(event) => setSimulationCount(event.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "end", gap: 8, fontSize: 13, color: "var(--color-text-primary)" }}>
            <input type="checkbox" checked={executeNow} onChange={(event) => setExecuteNow(event.target.checked)} />
            Execute worker pass immediately
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="button" style={{ width: "auto" }} onClick={handleSimulate} disabled={simulating}>
            {simulating ? "Queueing..." : "Queue Simulation"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>SLA Incidents</h3>
          <DataTable columns={incidentColumns} rows={incidents} keyField="id" emptyMessage="No current export incidents." />
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Workers</h3>
          {workerRows.length ? workerRows.map((worker) => (
            <div key={worker.workerId} style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-subtle)", display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <strong style={{ color: "var(--color-text-primary)" }}>{worker.workerId}</strong>
                <StatusPill value={worker.stale ? "Stale" : "Healthy"} tone={worker.stale ? "critical" : "success"} />
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Active jobs: {worker.activeJobs}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Last heartbeat: {formatTimestamp(worker.lastHeartbeatAt)}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Lease expires: {formatTimestamp(worker.leaseExpiresAt)}</div>
            </div>
          )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No active workers are holding export leases.</div>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Recent Export Jobs</h3>
          <DataTable columns={jobColumns} rows={recentJobs} keyField="id" emptyMessage="No export jobs recorded yet." />
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Recent Export Activity</h3>
          <DataTable columns={activityColumns} rows={recentActivity} keyField="id" emptyMessage="No export audit activity in the selected window." />
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Certification Runs</h3>
        <DataTable columns={certificationColumns} rows={certificationRuns} keyField="runId" emptyMessage="No certification runs in the selected window." />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Deployment Releases</h3>
          <DataTable columns={deploymentColumns} rows={deploymentRows} keyField="releaseId" emptyMessage="No deployment releases recorded in the selected window." />
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Backup Snapshots</h3>
          <DataTable columns={backupColumns} rows={backupRows} keyField="backupId" emptyMessage="No backup snapshots recorded in the selected window." />
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Recovery Drills</h3>
          <DataTable columns={recoveryColumns} rows={recoveryRows} keyField="runId" emptyMessage="No recovery drills recorded in the selected window." />
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Failover Certification</h3>
          <DataTable columns={failoverColumns} rows={failoverRows} keyField="runId" emptyMessage="No failover certifications recorded in the selected window." />
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Operational Recommendations</h3>
        {productionRecommendations.length ? productionRecommendations.map((recommendation, index) => (
          <div key={`${recommendation}-${index}`} style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-subtle)", fontSize: 13, color: "var(--color-text-primary)" }}>
            {recommendation}
          </div>
        )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No repair recommendations are active.</div>}
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Schedules Due Soon</h3>
          {dueSoonSchedules.length ? dueSoonSchedules.map((schedule) => (
            <div key={schedule.id} style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-subtle)" }}>
              <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{schedule.reportKey} · {schedule.exportFormat}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Next run: {formatTimestamp(schedule.nextRunAt)}</div>
            </div>
          )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No schedules are due in the next two hours.</div>}
        </div>

        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Artifacts Expiring Soon</h3>
          {expiringSoonArtifacts.length ? expiringSoonArtifacts.map((artifact) => (
            <div key={artifact.id} style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-subtle)" }}>
              <div style={{ fontWeight: 700, color: "var(--color-text-primary)" }}>{artifact.reportKey} · {artifact.exportFormat}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>Expires: {formatTimestamp(artifact.expiresAt)}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Size: {formatBytes(artifact.byteLength)}</div>
            </div>
          )) : <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No available artifacts are close to expiry.</div>}
        </div>
      </div>
    </section>
  );
}

export { SuperadminExportOperationsPage };