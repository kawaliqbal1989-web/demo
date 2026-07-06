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
  grantSecondAttempt,
  getExamResultPublicationAudit,
  getExamResults,
  getExamResultsReview,
  publishExamResults,
  revokeSecondAttempt,
  unpublishExamResults
} from "../../services/examCyclesService";

const EMPTY_FILTERS = {
  q: "",
  levelId: "",
  teacherUserId: "",
  centerNodeId: "",
  candidateStatus: "",
  resultOutcome: "",
  candidateType: ""
};

const STATUS_LABELS = {
  ABSENT: "Absent",
  IN_PROGRESS: "In Progress",
  SUBMITTED: "Submitted",
  TIMED_OUT: "Time Up"
};

const RESULT_LABELS = {
  SCORED: "Scored",
  ABSENT: "Absent",
  IN_PROGRESS: "In Progress",
  PENDING: "Pending"
};

function isPresent(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatPercent(value, row = null) {
  if (!isPresent(value)) {
    return row?.candidateStatus === "SUBMITTED" || row?.candidateStatus === "TIMED_OUT"
      ? "Pending"
      : "—";
  }

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";

  return `${numericValue.toFixed(2)}%`;
}

function formatDuration(value) {
  if (!isPresent(value)) return "—";

  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";

  const totalSeconds = Math.max(0, Math.floor(numericValue));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function getDownloadFilename(contentDisposition, fallback) {
  const header = String(contentDisposition || "");
  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);

  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = header.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || fallback;
}

function safeDownloadFilename(value, fallback) {
  const candidate = String(value || "")
    .replace(/[\\/:"*?<>|]+/g, "_")
    .trim();

  return candidate || fallback;
}

function getCandidateStatusTone(status) {
  if (status === "SUBMITTED") return "good";
  if (status === "IN_PROGRESS") return "warn";
  if (status === "TIMED_OUT") return "warn";
  return "neutral";
}

function getResultOutcomeTone(outcome) {
  if (outcome === "SCORED") return "good";
  if (outcome === "IN_PROGRESS" || outcome === "PENDING") return "warn";
  return "neutral";
}

function getAttempt2StatusLabel(status) {
  if (status === "IN_PROGRESS") return "Attempt 2 In Progress";
  if (status === "SUBMITTED") return "Attempt 2 Submitted";
  if (status === "TIMED_OUT") return "Attempt 2 Time Up";
  return "";
}

function badge(label, tone = "neutral") {
  const tones = {
    good: {
      background: "rgba(22, 163, 74, 0.12)",
      color: "#15803d"
    },
    bad: {
      background: "rgba(220, 38, 38, 0.12)",
      color: "#b91c1c"
    },
    warn: {
      background: "rgba(217, 119, 6, 0.12)",
      color: "#b45309"
    },
    neutral: {
      background: "var(--color-bg-subtle)",
      color: "var(--color-text-muted)"
    }
  };

  return (
    <span
      style={{
        ...tones[tone],
        borderRadius: 999,
        padding: "3px 8px",
        fontSize: 12,
        fontWeight: 700,
        whiteSpace: "nowrap"
      }}
    >
      {label}
    </span>
  );
}

function twoLine(primary, secondary) {
  const primaryText = isPresent(primary) ? String(primary) : "—";
  const secondaryText = isPresent(secondary) ? String(secondary) : "";

  return (
    <div style={{ display: "grid", gap: 2 }}>
      <span>{primaryText}</span>
      {secondaryText ? (
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          {secondaryText}
        </span>
      ) : null}
    </div>
  );
}

function optionList(rows, idKey, labelKey, secondaryKey) {
  const map = new Map();

  for (const row of rows) {
    const id = row?.[idKey];
    if (!isPresent(id) || map.has(String(id))) continue;

    const rawLabel = row?.[labelKey];
    const rawSecondary = row?.[secondaryKey];
    const label = isPresent(rawLabel)
      ? String(rawLabel)
      : isPresent(rawSecondary)
        ? String(rawSecondary)
        : String(id);

    const secondary =
      isPresent(rawSecondary) && String(rawSecondary) !== label
        ? String(rawSecondary)
        : "";

    map.set(String(id), {
      id: String(id),
      label,
      secondary
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    String(a.label).localeCompare(String(b.label), undefined, {
      numeric: true,
      sensitivity: "base"
    })
  );
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getSortValue(row, key) {
  if (!row) return null;

  if (key === "rank" || key === "score" || key === "percentage" || key === "completionTimeSeconds") {
    const numericValue = Number(row[key]);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  if (key === "submittedAt") {
    const timestamp = row.submittedAt ? new Date(row.submittedAt).getTime() : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  if (key === "candidateType") {
    return row.isTemporaryCandidate ? "TEMPORARY" : "REGULAR";
  }

  const value = row[key];
  return isPresent(value) ? String(value) : null;
}

function compareRows(left, right, sort) {
  const leftValue = getSortValue(left, sort.key);
  const rightValue = getSortValue(right, sort.key);

  if (leftValue === null && rightValue === null) {
    return normalize(left?.admissionNo || left?.studentName).localeCompare(
      normalize(right?.admissionNo || right?.studentName),
      undefined,
      { numeric: true }
    );
  }

  if (leftValue === null) return 1;
  if (rightValue === null) return -1;

  let comparison = 0;

  if (typeof leftValue === "number" && typeof rightValue === "number") {
    comparison = leftValue - rightValue;
  } else {
    comparison = String(leftValue).localeCompare(String(rightValue), undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  if (comparison === 0) {
    comparison = normalize(left?.admissionNo || left?.studentName).localeCompare(
      normalize(right?.admissionNo || right?.studentName),
      undefined,
      { numeric: true }
    );
  }

  return sort.dir === "asc" ? comparison : -comparison;
}

function SuperadminExamResultsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");
  const [acting, setActing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [review, setReview] = useState(null);
  const [publicationAudit, setPublicationAudit] = useState([]);
  const [publishNote, setPublishNote] = useState("");
  const [unpublishNote, setUnpublishNote] = useState("");
  const [confirmAction, setConfirmAction] = useState(null);
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
  const [sort, setSort] = useState({
    key: "studentName",
    dir: "asc"
  });

  const confirmType =
    typeof confirmAction === "string"
      ? confirmAction
      : confirmAction?.type || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [resultsData, reviewData, auditData] = await Promise.all([
        getExamResults(examCycleId),
        getExamResultsReview(examCycleId),
        getExamResultPublicationAudit(examCycleId)
      ]);

      setRows(Array.isArray(resultsData?.data?.results) ? resultsData.data.results : []);
      setResultStatus(String(resultsData?.data?.status || ""));
      setReview(reviewData?.data || null);
      setPublicationAudit(Array.isArray(auditData?.data) ? auditData.data : []);
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

  const canUnpublish = useMemo(
    () => resultStatus === "PUBLISHED",
    [resultStatus]
  );

  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => String(value || "").trim()),
    [filters]
  );

  const filterOptions = useMemo(
    () => ({
      levels: optionList(rows, "enrolledLevelId", "levelName", "levelRank"),
      teachers: optionList(rows, "teacherUserId", "teacherName", "teacherCode"),
      centers: optionList(rows, "centerNodeId", "centerName", "centerCode")
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const query = normalize(filters.q);

    return rows.filter((row) => {
      if (query) {
        const searchableValues = [
          row?.admissionNo,
          row?.studentName,
          row?.teacherCode,
          row?.teacherName,
          row?.centerCode,
          row?.centerName,
          row?.levelName,
          row?.rank
        ];

        if (!searchableValues.some((value) => normalize(value).includes(query))) {
          return false;
        }
      }

      if (
        filters.levelId &&
        String(row?.enrolledLevelId || "") !== String(filters.levelId)
      ) {
        return false;
      }

      if (
        filters.teacherUserId &&
        String(row?.teacherUserId || "") !== String(filters.teacherUserId)
      ) {
        return false;
      }

      if (
        filters.centerNodeId &&
        String(row?.centerNodeId || "") !== String(filters.centerNodeId)
      ) {
        return false;
      }

      if (
        filters.candidateStatus &&
        String(row?.candidateStatus || "") !== filters.candidateStatus
      ) {
        return false;
      }

      if (
        filters.resultOutcome &&
        String(row?.resultOutcome || "") !== filters.resultOutcome
      ) {
        return false;
      }

      if (filters.candidateType) {
        const candidateType = row?.isTemporaryCandidate
          ? "TEMPORARY"
          : "REGULAR";

        if (candidateType !== filters.candidateType) {
          return false;
        }
      }

      return true;
    });
  }, [filters, rows]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((left, right) => compareRows(left, right, sort)),
    [filteredRows, sort]
  );

  const summary = review?.summary || {};
  const levelWise = Array.isArray(review?.levelWise) ? review.levelWise : [];
  const topPerformers = Array.isArray(review?.topPerformers) ? review.topPerformers : [];
  const resultRules = review?.resultRules || {};
  const examMeta = review?.examCycle || null;

  const businessPartnerName =
    examMeta?.businessPartnerName ||
    examMeta?.businessPartner?.name ||
    null;

  const resultEmptyMessage = error
    ? "Unable to load exam results. Use Refresh to retry."
    : hasActiveFilters
      ? "No candidates match the selected filters."
      : "No approved exam candidates found.";

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value
    }));
  };

  const handleSort = (key) => {
    setSort((current) => {
      if (current.key === key) {
        return {
          key,
          dir: current.dir === "asc" ? "desc" : "asc"
        };
      }

      return {
        key,
        dir: "asc"
      };
    });
  };

  const doPublish = () => {
    if (acting || !canPublish) return;
    setConfirmAction("publish");
  };

  const doUnpublish = () => {
    if (acting || !canUnpublish) return;
    setConfirmAction("unpublish");
  };

  const doGrantSecondAttempt = (row) => {
    if (acting || !row?.studentId || !row?.canGrantSecondAttempt) return;
    setConfirmAction({
      type: "grant-second-attempt",
      row
    });
  };

  const doRevokeSecondAttempt = (row) => {
    if (acting || !row?.studentId || !row?.canRevokeSecondAttempt) return;
    setConfirmAction({
      type: "revoke-second-attempt",
      row
    });
  };

  const executeAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);

    if (!action) return;

    const actionType = typeof action === "string" ? action : action.type;
    const actionRow = action && typeof action === "object" ? action.row : null;

    setActing(true);
    setError("");

    try {
      if (actionType === "publish") {
        await publishExamResults(examCycleId, {
          confirmationAccepted: true,
          note: publishNote.trim() || null
        });
      } else if (actionType === "unpublish") {
        await unpublishExamResults(examCycleId, {
          note: unpublishNote.trim()
        });
      } else if (actionType === "grant-second-attempt") {
        await grantSecondAttempt(examCycleId, actionRow?.studentId);
      } else if (actionType === "revoke-second-attempt") {
        await revokeSecondAttempt(examCycleId, actionRow?.studentId);
      }

      if (actionType === "publish") {
        toast.success("Results published.");
      } else if (actionType === "unpublish") {
        toast.success("Results unpublished.");
      } else if (actionType === "grant-second-attempt") {
        toast.success("Second attempt granted.");
      } else if (actionType === "revoke-second-attempt") {
        toast.success("Second attempt revoked.");
      }

      await load();
    } catch (err) {
      const message =
        getFriendlyErrorMessage(err) ||
        (actionType === "publish" || actionType === "unpublish"
          ? `Failed to ${actionType} results.`
          : "Failed to update second attempt.");
      setError(message);
    } finally {
      setActing(false);
    }
  };

  const doExport = async () => {
    if (exporting) return;

    setExporting(true);

    try {
      const exportParams = {
        ...Object.fromEntries(
          Object.entries(filters).filter(([, value]) =>
            String(value || "").trim()
          )
        ),
        sortBy: sort.key,
        sortOrder: sort.dir
      };

      const response = await exportExamResultsCsv(
        examCycleId,
        exportParams
      );

      const contentDisposition =
        response?.headers?.["content-disposition"] ||
        response?.headers?.get?.("content-disposition");

      const fallback = `exam_results_${examMeta?.code || examCycleId}.csv`;
      const filename = safeDownloadFilename(
        getDownloadFilename(contentDisposition, fallback),
        fallback
      );

      downloadBlob(response.data, filename);
    } catch (err) {
      toast.error(
        getFriendlyErrorMessage(err) || "Failed to export CSV."
      );
    } finally {
      setExporting(false);
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading exam results..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap"
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0 }}>
            {examMeta?.name || "Exam Results"}
          </h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "4px 12px",
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}
          >
            {examMeta?.code ? <span>Code: <b>{examMeta.code}</b></span> : null}
            <span>Status: <b>{resultStatus || "—"}</b></span>
            {businessPartnerName ? (
              <span>Business Partner: <b>{businessPartnerName}</b></span>
            ) : null}
            {examMeta?.resultPublishedAt || examMeta?.publishedAt ? (
              <span>
                Published:{" "}
                <b>
                  {formatDateTime(
                    examMeta?.resultPublishedAt || examMeta?.publishedAt
                  )}
                </b>
              </span>
            ) : null}
          </div>
        </div>

        <button
          className="button secondary"
          type="button"
          onClick={() => navigate(-1)}
          style={{ width: "auto" }}
        >
          Back
        </button>
      </div>

      <div
        className="card"
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap"
        }}
      >
        <button
          className="button secondary"
          type="button"
          onClick={() => void load()}
          disabled={loading}
          style={{ width: "auto" }}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>

        <button
          className="button secondary"
          type="button"
          onClick={() => void doExport()}
          disabled={exporting || loading}
          style={{ width: "auto" }}
        >
          {exporting
            ? "Exporting..."
            : hasActiveFilters
              ? "Export Filtered CSV"
              : "Export CSV"}
        </button>

        <div style={{ flex: 1 }} />

        <button
          className="button"
          type="button"
          onClick={doPublish}
          disabled={acting || !canPublish}
          style={{ width: "auto" }}
        >
          Publish
        </button>

        <button
          className="button secondary"
          type="button"
          onClick={doUnpublish}
          disabled={acting || !canUnpublish}
          style={{ width: "auto" }}
        >
          Unpublish
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 600 }}>Review Summary</div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 10
          }}
        >
          <div><strong>Total Candidates:</strong> {summary.totalCandidates ?? 0}</div>
          <div><strong>Appeared:</strong> {summary.appearedCount ?? 0}</div>
          <div><strong>Scored:</strong> {summary.scoredCount ?? 0}</div>
          <div><strong>Ranked:</strong> {summary.rankedCount ?? 0}</div>
          <div><strong>Late Enrollment:</strong> {summary.lateEnrollmentCount ?? 0}</div>
          {summary.inProgressCount !== undefined ? (
            <div><strong>In Progress:</strong> {summary.inProgressCount ?? 0}</div>
          ) : null}
          {summary.timedOutCount !== undefined ? (
            <div><strong>Time Up:</strong> {summary.timedOutCount ?? 0}</div>
          ) : null}
          <div><strong>Absent:</strong> {summary.absentCount ?? 0}</div>
          <div>
            <strong>Average Accuracy:</strong>{" "}
            {isPresent(summary.avgScore)
              ? formatPercent(summary.avgScore)
              : "—"}
          </div>
          <div>
            <strong>Avg Time:</strong>{" "}
            {isPresent(summary.avgCompletionTimeSeconds)
              ? formatDuration(summary.avgCompletionTimeSeconds)
              : "-"}
          </div>
        </div>

        {Array.isArray(resultRules.rankingOrder) && resultRules.rankingOrder.length ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Ranking rule: {resultRules.rankingOrder.join(" -> ")}. Result state uses scored, pending, absent, and in-progress states.
          </div>
        ) : null}

        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Window: {formatDateTime(examMeta?.examStartsAt)} to{" "}
          {formatDateTime(examMeta?.examEndsAt)}
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap"
          }}
        >
          <div style={{ fontWeight: 600 }}>Candidate Results</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            Showing {sortedRows.length} of {rows.length} candidates
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 8
          }}
        >
          <input
            className="input"
            type="search"
            value={filters.q}
            onChange={(event) => updateFilter("q", event.target.value)}
            placeholder="Search student or teacher"
          />

          <select
            className="input"
            value={filters.levelId}
            onChange={(event) => updateFilter("levelId", event.target.value)}
          >
            <option value="">All levels</option>
            {filterOptions.levels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.label}
                {level.secondary ? ` (${level.secondary})` : ""}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.teacherUserId}
            onChange={(event) =>
              updateFilter("teacherUserId", event.target.value)
            }
          >
            <option value="">All teachers</option>
            {filterOptions.teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.label}
                {teacher.secondary ? ` (${teacher.secondary})` : ""}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.centerNodeId}
            onChange={(event) =>
              updateFilter("centerNodeId", event.target.value)
            }
          >
            <option value="">All centers</option>
            {filterOptions.centers.map((center) => (
              <option key={center.id} value={center.id}>
                {center.label}
                {center.secondary ? ` (${center.secondary})` : ""}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.candidateStatus}
            onChange={(event) =>
              updateFilter("candidateStatus", event.target.value)
            }
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.resultOutcome}
            onChange={(event) =>
              updateFilter("resultOutcome", event.target.value)
            }
          >
            <option value="">All result states</option>
            {Object.entries(RESULT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={filters.candidateType}
            onChange={(event) =>
              updateFilter("candidateType", event.target.value)
            }
          >
            <option value="">All candidate types</option>
            <option value="REGULAR">Regular</option>
            <option value="TEMPORARY">Temporary</option>
          </select>

          <button
            className="button secondary"
            type="button"
            onClick={() => setFilters({ ...EMPTY_FILTERS })}
            disabled={!hasActiveFilters}
            style={{ width: "auto" }}
          >
            Clear Filters
          </button>
        </div>

        <DataTable
          emptyMessage={resultEmptyMessage}
          columns={[
            {
              key: "rank",
              header: "Rank",
              sortable: true,
              render: (row) =>
                isPresent(row?.rank) ? `#${row.rank}` : "-"
            },
            {
              key: "admissionNo",
              header: "Student Code",
              sortable: true,
              render: (row) => row?.admissionNo || "—"
            },
            {
              key: "studentName",
              header: "Student Name",
              sortable: true,
              render: (row) => row?.studentName || "—"
            },
            {
              key: "candidateType",
              header: "Candidate Type",
              sortable: true,
              render: (row) =>
                row?.isTemporaryCandidate ? "Temporary" : "Regular"
            },
            {
              key: "enrollmentType",
              header: "Enrollment",
              render: (row) =>
                row?.isLateEnrollment ? "Late Enrollment" : "Regular"
            },
            {
              key: "levelName",
              header: "Level",
              sortable: true,
              render: (row) =>
                twoLine(
                  row?.levelName,
                  isPresent(row?.levelRank)
                    ? `Rank ${row.levelRank}`
                    : ""
                )
            },
            {
              key: "teacherName",
              header: "Teacher",
              sortable: true,
              render: (row) =>
                twoLine(
                  row?.teacherName ||
                    (row?.isTemporaryCandidate
                      ? "Center / Temporary"
                      : "—"),
                  row?.teacherCode
                )
            },
            {
              key: "centerName",
              header: "Center",
              sortable: true,
              render: (row) =>
                twoLine(row?.centerName, row?.centerCode)
            },
            {
              key: "candidateStatus",
              header: "Status",
              render: (row) =>
                badge(
                  STATUS_LABELS[row?.candidateStatus] || "—",
                  getCandidateStatusTone(row?.candidateStatus)
                )
            },
            {
              key: "correctCount",
              header: "Correct",
              render: (row) =>
                isPresent(row?.correctCount)
                  ? String(row.correctCount)
                  : "—"
            },
            {
              key: "wrongCount",
              header: "Wrong",
              render: (row) =>
                isPresent(row?.wrongCount)
                  ? String(row.wrongCount)
                  : "-"
            },
            {
              key: "unansweredCount",
              header: "Unanswered",
              render: (row) =>
                isPresent(row?.unansweredCount)
                  ? String(row.unansweredCount)
                  : "-"
            },
            {
              key: "totalQuestions",
              header: "Total",
              render: (row) =>
                isPresent(row?.totalQuestions)
                  ? String(row.totalQuestions)
                  : "—"
            },
            {
              key: "percentage",
              header: "Accuracy",
              sortable: true,
              render: (row) => formatPercent(row?.percentage, row)
            },
            {
              key: "resultOutcome",
              header: "Result State",
              render: (row) =>
                badge(
                  RESULT_LABELS[row?.resultOutcome] || "Pending",
                  getResultOutcomeTone(row?.resultOutcome)
                )
            },
            {
              key: "completionTimeSeconds",
              header: "Completion Time",
              sortable: true,
              render: (row) =>
                formatDuration(row?.completionTimeSeconds)
            },
            {
              key: "submittedAt",
              header: "Submitted At",
              sortable: true,
              render: (row) => formatDateTime(row?.submittedAt)
            },
            {
              key: "actions",
              header: "Actions",
              render: (row) => {
                const attempt2Status = String(row?.attempt2Status || "");
                const attempt2Label = getAttempt2StatusLabel(attempt2Status);

                if (attempt2Label) {
                  return badge(attempt2Label, attempt2Status === "TIMED_OUT" ? "warn" : "good");
                }

                if (row?.canGrantSecondAttempt) {
                  return (
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => doGrantSecondAttempt(row)}
                      disabled={acting}
                      style={{ width: "auto" }}
                    >
                      Grant 2nd Attempt
                    </button>
                  );
                }

                if (row?.canRevokeSecondAttempt) {
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {badge("2nd Attempt Granted", "warn")}
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => doRevokeSecondAttempt(row)}
                        disabled={acting}
                        style={{ width: "auto" }}
                      >
                        Revoke 2nd Attempt
                      </button>
                    </div>
                  );
                }

                if (row?.secondAttemptGranted) {
                  return badge("2nd Attempt Granted", "warn");
                }

                return "—";
              }
            }
          ]}
          rows={sortedRows}
          keyField={(row, index) => {
            if (row?.studentId) {
              return `${row.studentId}:${row?.enrolledLevelId || "no-level"}`;
            }

            return row?.admissionNo || `candidate-${index}`;
          }}
          onSort={handleSort}
          sortKey={sort.key}
          sortDir={sort.dir}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Level-wise Review</div>

        <DataTable
          rows={levelWise}
          emptyMessage="No level-wise data available."
          keyField={(row, index) =>
            row?.levelId || row?.levelName || `level-${index}`
          }
          columns={[
            {
              key: "level",
              header: "Level",
              render: (row) =>
                twoLine(
                  row?.levelName || row?.levelId,
                  isPresent(row?.levelRank)
                    ? `Rank ${row.levelRank}`
                    : ""
                )
            },
            {
              key: "total",
              header: "Total",
              render: (row) => String(row?.total ?? 0)
            },
            {
              key: "appeared",
              header: "Appeared",
              render: (row) => String(row?.appeared ?? 0)
            },
            {
              key: "absent",
              header: "Absent",
              render: (row) => String(row?.absent ?? 0)
            },
            {
              key: "scored",
              header: "Scored",
              render: (row) => String(row?.scored ?? 0)
            },
            {
              key: "ranked",
              header: "Ranked",
              render: (row) => String(row?.ranked ?? 0)
            },
            {
              key: "lateEnrollment",
              header: "Late",
              render: (row) => String(row?.lateEnrollment ?? 0)
            },
            {
              key: "inProgress",
              header: "In Progress",
              render: (row) => String(row?.inProgress ?? 0)
            },
            {
              key: "timedOut",
              header: "Time Up",
              render: (row) => String(row?.timedOut ?? 0)
            },
            {
              key: "avgScore",
              header: "Avg Accuracy",
              render: (row) =>
                isPresent(row?.avgScore)
                  ? formatPercent(row.avgScore)
                  : "—"
            }
          ]}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Top Performers</div>

        <DataTable
          rows={topPerformers}
          emptyMessage="No scored attempts yet."
          keyField={(row, index) => {
            if (row?.studentId) {
              return `${row.studentId}:${row?.levelId || "no-level"}`;
            }

            return row?.admissionNo || `performer-${index}`;
          }}
          columns={[
            {
              key: "rank",
              header: "Rank",
              render: (row) =>
                isPresent(row?.rank) ? `#${row.rank}` : "-"
            },
            {
              key: "admissionNo",
              header: "Student Code",
              render: (row) => row?.admissionNo || "—"
            },
            {
              key: "studentName",
              header: "Student",
              render: (row) => row?.studentName || "—"
            },
            {
              key: "level",
              header: "Level",
              render: (row) => row?.levelName || "—"
            },
            {
              key: "answers",
              header: "Answers",
              render: (row) =>
                isPresent(row?.correctCount) && isPresent(row?.totalQuestions)
                  ? `${row.correctCount}/${row.totalQuestions}`
                  : "-"
            },
            {
              key: "completionTimeSeconds",
              header: "Time",
              render: (row) => formatDuration(row?.completionTimeSeconds)
            },
            {
              key: "score",
              header: "Accuracy",
              render: (row) =>
                isPresent(row?.score)
                  ? formatPercent(row.score)
                  : "—"
            }
          ]}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Publication Audit Trail</div>

        <DataTable
          rows={publicationAudit}
          emptyMessage="No publication events recorded yet."
          keyField={(row, index) =>
            row?.id ||
            `${row?.action || "event"}-${row?.actedAt || index}`
          }
          columns={[
            {
              key: "actedAt",
              header: "When",
              render: (row) => formatDateTime(row?.actedAt)
            },
            {
              key: "action",
              header: "Action",
              render: (row) => row?.action || "—"
            },
            {
              key: "actor",
              header: "Actor",
              render: (row) =>
                row?.actedByUser?.username ||
                row?.actedByUser?.email ||
                "—"
            },
            {
              key: "role",
              header: "Role",
              render: (row) =>
                row?.actedByUser?.role || "—"
            },
            {
              key: "notes",
              header: "Notes",
              render: (row) => row?.notes || "—"
            }
          ]}
        />
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Governance Notes</div>

        <label style={{ display: "grid", gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}
          >
            Publish note (optional)
          </span>

          <textarea
            value={publishNote}
            onChange={(event) => setPublishNote(event.target.value)}
            rows={2}
            placeholder="Optional note for publication audit trail"
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}
          >
            Unpublish note (required)
          </span>

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
        title={
          confirmType === "publish"
            ? "Publish Results"
            : confirmType === "unpublish"
              ? "Unpublish Results"
              : confirmType === "grant-second-attempt"
                ? "Grant 2nd Attempt"
                : "Revoke 2nd Attempt"
        }
        message={
          confirmType === "publish"
            ? "Publish results now? Published results will become visible to permitted hierarchy roles and students."
            : confirmType === "unpublish"
              ? "Unpublish results? Non-superadmin roles will lose access until republished."
              : confirmType === "grant-second-attempt"
                ? "Grant one additional exam attempt to this student?"
                : "Revoke the additional exam attempt for this student?"
        }
        confirmLabel={
          confirmType === "publish"
            ? "Publish"
            : confirmType === "unpublish"
              ? "Unpublish"
              : confirmType === "grant-second-attempt"
                ? "Grant Attempt"
                : "Revoke Attempt"
        }
        confirmDisabled={
          confirmType === "unpublish" &&
          unpublishNote.trim().length < 8
        }
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeAction()}
      />
    </section>
  );
}

export { SuperadminExamResultsPage };
