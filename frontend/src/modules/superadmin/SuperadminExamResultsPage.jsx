import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
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

function formatDuration(value) {
  if (value === null || value === undefined || value === "") return "\u2014";
  const totalSeconds = Math.max(0, Math.floor(Number(value)));
  if (!Number.isFinite(totalSeconds)) return "\u2014";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function hasAppeared(row) {
  return row?.score !== null && row?.score !== undefined;
}

function formatAccuracy(row) {
  const correct = Number(row?.correctCount);
  const total = Number(row?.totalQuestions);
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return "\u2014";
  return `${Math.round((correct / total) * 1000) / 10}%`;
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
  const [search, setSearch] = useState("");
  const [attendanceFilter, setAttendanceFilter] = useState("ALL");

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

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const appeared = hasAppeared(row);
      if (attendanceFilter === "APPEARED" && !appeared) return false;
      if (attendanceFilter === "ABSENT" && appeared) return false;
      if (!q) return true;
      return [row?.studentName, row?.admissionNo].some((value) =>
        String(value || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, attendanceFilter]);

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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{examMeta?.name ? `Exam Results: ${examMeta.name}` : "Exam Results"}</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            {examMeta?.code ? `Cycle ${examMeta.code} \u00b7 ` : ""}Superadmin result review and publication governance.
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            Status: <StatusBadge value={resultStatus || "PENDING"} />
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Candidates", summary.totalCandidates ?? 0],
          ["Appeared", summary.appearedCount ?? 0],
          ["Absent", summary.absentCount ?? 0],
          ["Pass", summary.passCount ?? 0],
          ["Fail", summary.failCount ?? 0],
          ["Average Score", summary.avgScore ?? 0]
        ].map(([label, value]) => (
          <div key={label} className="card" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{Number(value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        Window: {formatDateTime(examMeta?.examStartsAt)} to {formatDateTime(examMeta?.examEndsAt)}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Top Performers</div>
        <DataTable
          rows={topPerformers}
          emptyMessage="No scored attempts yet."
          keyField={(row) => row?.studentId || row?.admissionNo}
          columns={[
            { key: "admissionNo", header: "Student Code", render: (row) => row?.admissionNo || "\u2014" },
            { key: "studentName", header: "Student", render: (row) => row?.studentName || "\u2014" },
            { key: "level", header: "Level", render: (row) => row?.levelName || "\u2014" },
            { key: "score", header: "Score", render: (row) => (row?.score === null || row?.score === undefined ? "\u2014" : String(row.score)) }
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Student name or code"
            />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Attendance
            <select className="input" value={attendanceFilter} onChange={(event) => setAttendanceFilter(event.target.value)}>
              <option value="ALL">All candidates</option>
              <option value="APPEARED">Appeared</option>
              <option value="ABSENT">Absent</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearch("");
              setAttendanceFilter("ALL");
            }}
          >
            Reset
          </button>
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          Showing {visibleRows.length} of {rows.length} result rows.
        </div>
        <div style={{ overflow: "auto" }}>
          <DataTable
            emptyMessage={error
              ? "Unable to load exam results. Use Refresh to retry."
              : rows.length
                ? "No result rows match the selected filters."
                : resultStatus === "PUBLISHED"
                  ? "No published results found."
                  : "No exam results available yet."}
            columns={[
              {
                key: "student",
                header: "Student",
                render: (r) => (
                  <div style={{ display: "grid", gap: 2 }}>
                    <strong>{r?.studentName || "\u2014"}</strong>
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{r?.admissionNo || "\u2014"}</span>
                  </div>
                )
              },
              {
                key: "attendance",
                header: "Attendance",
                render: (r) => <StatusBadge value={hasAppeared(r) ? "APPEARED" : "ABSENT"} />
              },
              {
                key: "score",
                header: "Score",
                render: (r) => (hasAppeared(r) ? String(r.score) : "Absent")
              },
              {
                key: "correct",
                header: "Correct / Total",
                render: (r) => (r?.correctCount != null && r?.totalQuestions != null
                  ? `${r.correctCount}/${r.totalQuestions}`
                  : "\u2014")
              },
              { key: "accuracy", header: "Accuracy", render: (r) => formatAccuracy(r) },
              { key: "time", header: "Time", render: (r) => formatDuration(r?.completionTimeSeconds) },
              {
                key: "submittedAt",
                header: "Submitted",
                render: (r) => (r?.submittedAt
                  ? formatDateTime(r.submittedAt)
                  : hasAppeared(r)
                    ? "Not submitted"
                    : "Absent")
              }
            ]}
            rows={visibleRows}
            keyField={(row) => row?.studentId || row?.admissionNo || JSON.stringify(row)}
          />
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Publication Audit Trail</div>
        <DataTable
          rows={publicationAudit}
          emptyMessage="No publication events recorded yet."
          keyField={(row) => row?.id || `${row?.action}-${row?.actedAt}`}
          columns={[
            { key: "actedAt", header: "When", render: (row) => formatDateTime(row?.actedAt) },
            { key: "action", header: "Action", render: (row) => row?.action || "\u2014" },
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
