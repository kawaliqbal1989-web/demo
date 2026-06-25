import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getFriendlyErrorMessage } from "../utils/apiErrors";
import { downloadBlob } from "../utils/downloadBlob";
import {
  buildPrintableReportPath,
  downloadReportExportJobArtifact,
  exportReportExcel,
  exportReportPdf,
  getReportExportJob,
  getReportExportJobs,
  getReportExportOperationsSummary,
  retryReportExportJob
} from "../services/reportingFoundationService";
import { ReportExportButton } from "./ReportExportButton";

function extractFilenameFromDisposition(disposition, fallback) {
  const match = String(disposition || "").match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

function isActiveExportStatus(status) {
  return ["QUEUED", "PROCESSING", "RETRY_WAIT"].includes(String(status || "").toUpperCase());
}

function formatExportStatus(status) {
  return String(status || "UNKNOWN")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const panelStyle = {
  border: "1px solid rgba(12, 38, 61, 0.14)",
  borderRadius: 16,
  padding: 14,
  background: "linear-gradient(180deg, rgba(247, 250, 252, 0.98) 0%, rgba(238, 244, 247, 0.96) 100%)",
  display: "grid",
  gap: 10,
  minWidth: 280
};

const mutedTextStyle = {
  fontSize: 12,
  color: "#4d6576"
};

function ReportActionButtons({ reportKey, params = {}, hidePrint = false }) {
  const printablePath = buildPrintableReportPath(reportKey, params);
  const paramsSignature = useMemo(() => JSON.stringify(params || {}), [params]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [latestJob, setLatestJob] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [opsSummary, setOpsSummary] = useState(null);

  const handlePrint = () => {
    const printableWindow = window.open(printablePath, "_blank", "noopener,noreferrer");
    if (!printableWindow) {
      window.location.assign(printablePath);
    }
  };

  const loadRecentJobs = async () => {
    const response = await getReportExportJobs({ reportKey, limit: 4 }, { _skipGlobalLoading: true });
    const items = response?.data?.items || [];
    setRecentJobs(items);
    setLatestJob((current) => {
      if (current) {
        return items.find((item) => item.id === current.id) || current;
      }
      return items[0] || null;
    });
  };

  const loadOperationsSummary = async () => {
    const response = await getReportExportOperationsSummary({ _skipGlobalLoading: true, _suppressErrorLogging: true });
    setOpsSummary(response?.data || null);
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [jobsResponse, opsResponse] = await Promise.all([
          getReportExportJobs({ reportKey, limit: 4 }, { _skipGlobalLoading: true, _suppressErrorLogging: true }),
          getReportExportOperationsSummary({ _skipGlobalLoading: true, _suppressErrorLogging: true })
        ]);

        if (cancelled) {
          return;
        }

        const items = jobsResponse?.data?.items || [];
        setRecentJobs(items);
        setLatestJob(items[0] || null);
        setOpsSummary(opsResponse?.data || null);
      } catch {
        if (!cancelled) {
          setRecentJobs([]);
          setOpsSummary(null);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reportKey, paramsSignature]);

  useEffect(() => {
    if (!latestJob?.id || !isActiveExportStatus(latestJob.status)) {
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await getReportExportJob(latestJob.id, { _skipGlobalLoading: true, _suppressErrorLogging: true });
        const job = response?.data?.job || null;
        if (job) {
          setLatestJob(job);
          await loadRecentJobs();
          if (job.status === "COMPLETED" && job.artifact?.status === "AVAILABLE") {
            toast.success("Export artifact is ready to download.");
          }
        }
      } catch {
        // Polling failures should not interrupt report interactions.
      }
    }, 3000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [latestJob?.id, latestJob?.status]);

  const handleDownload = async (job = latestJob) => {
    if (!job?.id) {
      return;
    }

    try {
      const response = await downloadReportExportJobArtifact(job.id, { _skipGlobalLoading: true });
      const fallbackName = job.artifact?.fileName || `${job.reportKey}.${job.exportFormat === "PDF" ? "pdf" : "xlsx"}`;
      const filename = extractFilenameFromDisposition(response.headers?.["content-disposition"], fallbackName);
      downloadBlob(response.data, filename);
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error) || "Failed to download export artifact.");
    }
  };

  const handleRetry = async (job = latestJob) => {
    if (!job?.id) {
      return;
    }

    try {
      const response = await retryReportExportJob(job.id, { _skipGlobalLoading: true });
      setLatestJob(response?.data?.job || null);
      await loadRecentJobs();
      await loadOperationsSummary();
      toast.success("Export job requeued.");
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error) || "Failed to retry export.");
    }
  };

  const handleExport = async (kind) => {
    try {
      setIsSubmitting(true);
      const response = kind === "pdf"
        ? await exportReportPdf(reportKey, params)
        : await exportReportExcel(reportKey, params);

      const job = response?.data?.job || null;
      setLatestJob(job);
      await loadRecentJobs();
      await loadOperationsSummary();

      if (job?.status === "COMPLETED" && job?.artifact?.status === "AVAILABLE") {
        toast.success("Export artifact is ready.");
      } else {
        toast.success(`${kind.toUpperCase()} export queued.`);
      }
    } catch (error) {
      toast.error(getFriendlyErrorMessage(error) || `Failed to export ${kind.toUpperCase()}.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReportExportButton
          hidePrint={hidePrint}
          busy={isSubmitting}
          onPrint={handlePrint}
          onExportPdf={() => handleExport("pdf")}
          onExportExcel={() => handleExport("excel")}
        />
      </div>

      <div style={panelStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#173042" }}>Export operations</div>
            <div style={mutedTextStyle}>Background queue, retries, and artifact lifecycle for this report.</div>
          </div>
          {latestJob ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: "#173042" }}>{formatExportStatus(latestJob.status)}</div>
          ) : null}
        </div>

        {opsSummary ? (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", ...mutedTextStyle }}>
            <span>Queued SLA breaches: {opsSummary.queuedSlaBreaches || 0}</span>
            <span>Processing SLA breaches: {opsSummary.processingSlaBreaches || 0}</span>
            <span>Retry wait: {opsSummary.retryWaitCount || 0}</span>
          </div>
        ) : null}

        {latestJob ? (
          <div style={{ display: "grid", gap: 8, padding: 10, borderRadius: 12, background: "rgba(255,255,255,0.85)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#173042" }}>Job {latestJob.id.slice(0, 8)} • {latestJob.exportFormat}</span>
              <span style={mutedTextStyle}>Phase: {latestJob.progress?.phase || "Queued"}</span>
            </div>
            <div style={mutedTextStyle}>
              Snapshot: {latestJob.snapshotReferenceId || "Pending"}
            </div>
            <div style={mutedTextStyle}>
              Progress: {latestJob.progress?.percent ?? 0}%
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="button secondary"
                style={{ width: "auto" }}
                type="button"
                disabled={latestJob.status !== "COMPLETED" || latestJob.artifact?.status !== "AVAILABLE"}
                onClick={() => handleDownload(latestJob)}
              >
                Download artifact
              </button>
              <button
                className="button secondary"
                style={{ width: "auto" }}
                type="button"
                disabled={!latestJob || !["FAILED", "EXPIRED", "CANCELLED"].includes(latestJob.status)}
                onClick={() => handleRetry(latestJob)}
              >
                Retry export
              </button>
            </div>
          </div>
        ) : (
          <div style={mutedTextStyle}>No export jobs yet for this report.</div>
        )}

        {recentJobs.length > 1 ? (
          <div style={{ display: "grid", gap: 6 }}>
            {recentJobs.slice(0, 3).map((job) => (
              <div
                key={job.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  padding: "8px 10px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.72)"
                }}
              >
                <div style={{ display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#173042" }}>{job.exportFormat} • {formatExportStatus(job.status)}</span>
                  <span style={mutedTextStyle}>{job.snapshotReferenceId || "Pending snapshot"}</span>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    className="button secondary"
                    style={{ width: "auto", padding: "6px 10px" }}
                    type="button"
                    disabled={job.status !== "COMPLETED" || job.artifact?.status !== "AVAILABLE"}
                    onClick={() => handleDownload(job)}
                  >
                    Download
                  </button>
                  <button
                    className="button secondary"
                    style={{ width: "auto", padding: "6px 10px" }}
                    type="button"
                    disabled={!['FAILED', 'EXPIRED', 'CANCELLED'].includes(job.status)}
                    onClick={() => handleRetry(job)}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { ReportActionButtons };