import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  exportExamResultsCsv,
  getExamResultPublicationAudit,
  getExamResults,
  getExamResultsReview,
  publishExamResults,
  unpublishExamResults
} from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function SuperadminExamResultsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");
  const [acting, setActing] = useState(false);
  const [review, setReview] = useState(null);
  const [publicationAudit, setPublicationAudit] = useState([]);
  const [publishNote, setPublishNote] = useState("");
  const [unpublishNote, setUnpublishNote] = useState("");
  const [confirmAction, setConfirmAction] = useState(null); // "publish" | "unpublish" | null

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [resultsData, reviewData, auditData] = await Promise.all([
        getExamResults(examCycleId),
        getExamResultsReview(examCycleId),
        getExamResultPublicationAudit(examCycleId)
      ]);

      setRows(resultsData?.data?.results || []);
      setResultStatus(String(resultsData?.data?.status || ""));
      setReview(reviewData?.data || null);
      setPublicationAudit(auditData?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load results.");
    } finally {
      setLoading(false);
    }
  }, [examCycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canPublish = useMemo(
    () => resultStatus === "READY_FOR_REVIEW" || resultStatus === "LOCKED",
    [resultStatus]
  );
  const canUnpublish = useMemo(() => resultStatus === "PUBLISHED", [resultStatus]);

  const doPublish = async () => {
    if (acting || !canPublish) return;
    setConfirmAction("publish");
  };

  const doUnpublish = async () => {
    if (acting || !canUnpublish) return;
    setConfirmAction("unpublish");
  };

  const executeAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    if (!action) {
      return;
    }
    setActing(true);
    setError("");
    try {
      if (action === "publish") {
        await publishExamResults(examCycleId, {
          confirmationAccepted: true,
          note: publishNote.trim() || null
        });
      } else {
        await unpublishExamResults(examCycleId, {
          note: unpublishNote.trim()
        });
      }
      toast.success(action === "publish" ? "Results published." : "Results unpublished.");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || `Failed to ${action} results.`);
    } finally {
      setActing(false);
    }
  };

  const doExport = async () => {
    try {
      const resp = await exportExamResultsCsv(examCycleId);
      downloadBlob(resp.data, `exam_results_${examCycleId}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam results..." />;
  }

  const summary = review?.summary || {};
  const levelWise = review?.levelWise || [];
  const topPerformers = review?.topPerformers || [];
  const examMeta = review?.examCycle || null;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: <b>{resultStatus}</b>
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
          Refresh
        </button>
        <button className="button secondary" type="button" onClick={() => void doExport()} style={{ width: "auto" }}>
          Export CSV
        </button>
        <div style={{ flex: 1 }} />
        <button className="button" type="button" onClick={() => void doPublish()} disabled={acting || !canPublish} style={{ width: "auto" }}>
          Publish
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => void doUnpublish()}
          disabled={acting || !canUnpublish}
          style={{ width: "auto" }}
        >
          Unpublish
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>Review Summary</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div><strong>Total Candidates:</strong> {summary.totalCandidates ?? 0}</div>
          <div><strong>Appeared:</strong> {summary.appearedCount ?? 0}</div>
          <div><strong>Absent:</strong> {summary.absentCount ?? 0}</div>
          <div><strong>Pass:</strong> {summary.passCount ?? 0}</div>
          <div><strong>Fail:</strong> {summary.failCount ?? 0}</div>
          <div><strong>Average Score:</strong> {summary.avgScore ?? 0}</div>
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Window: {formatDateTime(examMeta?.examStartsAt)} to {formatDateTime(examMeta?.examEndsAt)}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Top Performers</div>
        <DataTable
          rows={topPerformers}
          emptyMessage="No scored attempts yet."
          keyField={(row) => row?.studentId || row?.admissionNo}
          columns={[
            { key: "admissionNo", header: "Student Code", render: (row) => row?.admissionNo || "" },
            { key: "studentName", header: "Student", render: (row) => row?.studentName || "" },
            { key: "level", header: "Level", render: (row) => row?.levelName || "-" },
            { key: "score", header: "Score", render: (row) => String(row?.score ?? "") }
          ]}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Level-wise Review</div>
        <DataTable
          rows={levelWise}
          emptyMessage="No level-wise data available."
          keyField={(row) => row?.levelId || row?.levelName}
          columns={[
            { key: "level", header: "Level", render: (row) => row?.levelName || row?.levelId || "-" },
            { key: "total", header: "Total", render: (row) => String(row?.total ?? 0) },
            { key: "appeared", header: "Appeared", render: (row) => String(row?.appeared ?? 0) },
            { key: "absent", header: "Absent", render: (row) => String(row?.absent ?? 0) },
            { key: "pass", header: "Pass", render: (row) => String(row?.pass ?? 0) },
            { key: "fail", header: "Fail", render: (row) => String(row?.fail ?? 0) },
            { key: "avgScore", header: "Avg Score", render: (row) => String(row?.avgScore ?? 0) }
          ]}
        />
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Results</div>
        <DataTable
          emptyMessage={error ? "Unable to load exam results. Use Refresh to retry." : resultStatus === "PUBLISHED" ? "No published results found." : "No exam results available yet."}
          columns={[
            { key: "admissionNo", header: "Student Code", render: (r) => r?.admissionNo || "" },
            { key: "name", header: "Student Name", render: (r) => r?.studentName || "" },
            { key: "score", header: "Score", render: (r) => (r?.score === null || r?.score === undefined ? "" : String(r.score)) },
            { key: "correct", header: "Correct", render: (r) => (r?.correctCount === null || r?.correctCount === undefined ? "" : String(r.correctCount)) },
            { key: "total", header: "Total", render: (r) => (r?.totalQuestions === null || r?.totalQuestions === undefined ? "" : String(r.totalQuestions)) },
            { key: "time", header: "Time (sec)", render: (r) => (r?.completionTimeSeconds === null || r?.completionTimeSeconds === undefined ? "" : String(r.completionTimeSeconds)) }
          ]}
          rows={rows}
          keyField={(row) => row?.studentId || row?.admissionNo || JSON.stringify(row)}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Publication Audit Trail</div>
        <DataTable
          rows={publicationAudit}
          emptyMessage="No publication events recorded yet."
          keyField={(row) => row?.id || `${row?.action}-${row?.actedAt}`}
          columns={[
            { key: "actedAt", header: "When", render: (row) => formatDateTime(row?.actedAt) },
            { key: "action", header: "Action", render: (row) => row?.action || "" },
            { key: "actor", header: "Actor", render: (row) => row?.actedByUser?.username || row?.actedByUser?.email || "-" },
            { key: "role", header: "Role", render: (row) => row?.actedByUser?.role || "-" },
            { key: "notes", header: "Notes", render: (row) => row?.notes || "-" }
          ]}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Governance Notes</div>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Publish note (optional)</span>
          <textarea
            value={publishNote}
            onChange={(event) => setPublishNote(event.target.value)}
            rows={2}
            placeholder="Optional note for publication audit trail"
          />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Unpublish note (required)</span>
          <textarea
            value={unpublishNote}
            onChange={(event) => setUnpublishNote(event.target.value)}
            rows={2}
            placeholder="Reason for unpublishing (minimum 8 characters)"
          />
        </label>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === "publish" ? "Publish Results" : "Unpublish Results"}
        message={confirmAction === "publish"
          ? "Publish results now? Students and parents will be notified that results are available."
          : "Unpublish results? Non-superadmin roles will lose access until republished."}
        confirmLabel={confirmAction === "publish" ? "Publish" : "Unpublish"}
        confirmDisabled={confirmAction === "unpublish" && unpublishNote.trim().length < 8}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeAction()}
      />
    </section>
  );
}

export { SuperadminExamResultsPage };
