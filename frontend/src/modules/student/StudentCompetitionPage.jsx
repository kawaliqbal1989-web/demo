import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listStudentWorksheets } from "../../services/studentPortalService";

const PAGE_SIZE = 100;
const MAX_PAGES = 10;

function formatDateTime(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function formatDuration(seconds) {
  const safeSeconds = Number(seconds);
  if (!Number.isFinite(safeSeconds) || safeSeconds <= 0) return "—";
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return remainder ? `${minutes}m ${remainder}s` : `${minutes} min`;
}

function toLabel(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part[0] + part.slice(1).toLowerCase())
    .join(" ");
}

function getScheduleStatus(context) {
  const now = Date.now();
  const startsAt = context?.startsAt ? new Date(context.startsAt).getTime() : NaN;
  const endsAt = context?.endsAt ? new Date(context.endsAt).getTime() : NaN;

  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "UNKNOWN";
  if (now < startsAt) return "UPCOMING";
  if (now > endsAt) return "CLOSED";
  return "OPEN";
}

function getTone(status) {
  if (["OPEN", "SUBMITTED", "PUBLISHED"].includes(status)) return "success";
  if (["IN_PROGRESS", "READY"].includes(status)) return "info";
  if (["UPCOMING", "NOT_STARTED", "PENDING"].includes(status)) return "warning";
  if (["CLOSED", "TIMED_OUT", "EXCLUDED"].includes(status)) return "danger";
  return "neutral";
}

function StatusPill({ status, label }) {
  const palettes = {
    success: { background: "#dcfce7", border: "#bbf7d0", color: "#166534" },
    info: { background: "#dbeafe", border: "#bfdbfe", color: "#1d4ed8" },
    warning: { background: "#fef3c7", border: "#fde68a", color: "#92400e" },
    danger: { background: "#fee2e2", border: "#fecaca", color: "#991b1b" },
    neutral: { background: "#f3f4f6", border: "#e5e7eb", color: "#374151" }
  };
  const palette = palettes[getTone(status)] || palettes.neutral;

  return (
    <span
      style={{
        ...palette,
        alignItems: "center",
        borderRadius: 999,
        borderStyle: "solid",
        borderWidth: 1,
        display: "inline-flex",
        fontSize: 12,
        fontWeight: 700,
        padding: "3px 8px",
        whiteSpace: "nowrap"
      }}
    >
      {label || toLabel(status) || "Unknown"}
    </span>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${color}`, display: "grid", gap: 6 }}>
      <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
        {label}
      </span>
      <strong style={{ fontSize: 28, lineHeight: 1 }}>{value}</strong>
    </div>
  );
}

function getAssessmentContext(item) {
  const context = item?.assessmentContext;
  if (!context || String(context.sourceSystem || "").toUpperCase() !== "COMPETITION") {
    return null;
  }

  return {
    ...context,
    competition: context.competition || {},
    level: context.level || {},
    course: context.course || {}
  };
}

async function fetchCompetitionWorksheets() {
  const competitionItems = [];
  let page = 1;
  let total = 0;

  while (page <= MAX_PAGES) {
    // eslint-disable-next-line no-await-in-loop
    const response = await listStudentWorksheets({
      page,
      pageSize: PAGE_SIZE
    });
    const payload = response?.data?.data || {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    total = Number(payload.total || 0);

    for (const item of items) {
      if (getAssessmentContext(item)) {
        competitionItems.push(item);
      }
    }

    if (!items.length || page * PAGE_SIZE >= total) break;
    page += 1;
  }

  return competitionItems;
}

function StudentCompetitionPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [scheduleFilter, setScheduleFilter] = useState("ALL");
  const [attemptFilter, setAttemptFilter] = useState("ALL");
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async ({ refresh = false } = {}) => {
    const requestId = ++loadRequestIdRef.current;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const result = await fetchCompetitionWorksheets();
      if (requestId !== loadRequestIdRef.current) return;
      setItems(result);
    } catch (requestError) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(
        getFriendlyErrorMessage(requestError) ||
          "Unable to load your Competition assessments."
      );
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();

    return () => {
      loadRequestIdRef.current += 1;
    };
  }, [load]);

  const rows = useMemo(
    () =>
      items.map((item) => {
        const context = getAssessmentContext(item);
        const scheduleStatus = getScheduleStatus(context);
        const attemptStatus = String(item?.status || "NOT_STARTED").toUpperCase();
        const attemptsUsed = Number(context?.attemptsUsed || 0);
        const attemptLimit = Math.max(1, Number(context?.attemptLimit || 1));
        const resultStatus = String(context?.resultStatus || "DRAFT").toUpperCase();

        return {
          ...item,
          context,
          scheduleStatus,
          attemptStatus,
          attemptsUsed,
          attemptLimit,
          resultStatus,
          canAttempt:
            context?.includedInAssessment !== false &&
            String(context?.participantStatus || "ACTIVE").toUpperCase() === "ACTIVE" &&
            scheduleStatus === "OPEN" &&
            attemptsUsed < attemptLimit
        };
      }),
    [items]
  );

  const summary = useMemo(
    () => ({
      participationIds: rows.length,
      ready: rows.filter((row) => row.canAttempt && row.attemptStatus === "NOT_STARTED").length,
      inProgress: rows.filter((row) => row.attemptStatus === "IN_PROGRESS").length,
      completed: rows.filter((row) => ["SUBMITTED", "TIMED_OUT"].includes(row.attemptStatus)).length,
      published: rows.filter((row) => row.resultStatus === "PUBLISHED").length
    }),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return rows.filter((row) => {
      if (scheduleFilter !== "ALL" && row.scheduleStatus !== scheduleFilter) {
        return false;
      }
      if (attemptFilter !== "ALL" && row.attemptStatus !== attemptFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      return [
        row.context?.competition?.title,
        row.context?.competition?.code,
        row.context?.course?.name,
        row.context?.level?.name,
        row.context?.participationId,
        row.title
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(normalizedQuery)
      );
    });
  }, [attemptFilter, query, rows, scheduleFilter]);

  if (loading) {
    return <LoadingState label="Loading Competition assessments..." />;
  }

  return (
    <section className="dash-section" style={{ display: "grid", gap: 12 }}>
      <div
        className="dash-header"
        style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}
      >
        <div>
          <h2 style={{ margin: 0 }}>My Competitions</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            View each approved level participation ID, assigned worksheet, attempt status, and result.
          </div>
        </div>
        <button
          className="button secondary"
          disabled={refreshing}
          onClick={() => load({ refresh: true })}
          style={{ width: "auto" }}
          type="button"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      {!error ? (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))"
          }}
        >
          <SummaryCard label="Participation IDs" value={summary.participationIds} color="#2563eb" />
          <SummaryCard label="Ready to Start" value={summary.ready} color="#0284c7" />
          <SummaryCard label="In Progress" value={summary.inProgress} color="#16a34a" />
          <SummaryCard label="Completed" value={summary.completed} color="#0f766e" />
          <SummaryCard label="Results Published" value={summary.published} color="#7c3aed" />
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <label style={{ display: "grid", flex: "1 1 260px", gap: 4, minWidth: 0 }}>
          Search
          <input
            className="input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Competition, course, level, or participation ID"
            value={query}
          />
        </label>

        <label style={{ display: "grid", flex: "1 1 160px", gap: 4, minWidth: 0 }}>
          Schedule
          <select
            className="input"
            onChange={(event) => setScheduleFilter(event.target.value)}
            value={scheduleFilter}
          >
            <option value="ALL">All</option>
            <option value="UPCOMING">Upcoming</option>
            <option value="OPEN">Open</option>
            <option value="CLOSED">Closed</option>
            <option value="UNKNOWN">Not Scheduled</option>
          </select>
        </label>

        <label style={{ display: "grid", flex: "1 1 160px", gap: 4, minWidth: 0 }}>
          Attempt
          <select
            className="input"
            onChange={(event) => setAttemptFilter(event.target.value)}
            value={attemptFilter}
          >
            <option value="ALL">All</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="TIMED_OUT">Timed Out</option>
          </select>
        </label>

        <button
          className="button secondary"
          onClick={() => {
            setQuery("");
            setScheduleFilter("ALL");
            setAttemptFilter("ALL");
          }}
          style={{ alignSelf: "flex-end", width: "auto" }}
          type="button"
        >
          Reset
        </button>
      </div>

      {!error && rows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>
            No approved Competition worksheet is assigned to you yet.
          </p>
        </div>
      ) : null}

      {!error && rows.length > 0 && filteredRows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>No Competition participation IDs match these filters.</p>
        </div>
      ) : null}

      {!error && filteredRows.length > 0 ? (
        <div className="card dash-card" style={{ overflowX: "auto" }}>
          <table className="dash-table">
            <thead>
              <tr>
                <th>Competition</th>
                <th>Course / Level</th>
                <th>Participation ID</th>
                <th>Schedule</th>
                <th>Worksheet</th>
                <th>Attempt</th>
                <th>Result</th>
                <th style={{ textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const competition = row.context.competition;
                const participationId =
                  row.context.participationId || row.context.sourceEntityId;
                const participantStatus = String(
                  row.context.participantStatus || "ACTIVE"
                ).toUpperCase();
                const attemptUrl =
                  `/student/worksheets/${row.worksheetId}` +
                  `?competitionMode=1&examMode=1&participationId=${encodeURIComponent(
                    participationId || ""
                  )}${["SUBMITTED", "TIMED_OUT"].includes(row.attemptStatus) ? "&startSecondAttempt=1" : ""}`;

                return (
                  <tr key={participationId || `${row.worksheetId}-${row.context.level?.id || "level"}`}>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <strong>{competition.title || "Competition"}</strong>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {competition.code || "—"}
                        </span>
                        <StatusPill status={participantStatus} />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <span>{row.context.course?.name || "—"}</span>
                        <strong>{row.context.level?.name || "—"}</strong>
                      </div>
                    </td>
                    <td>
                      <code style={{ fontSize: 12 }}>{participationId || "—"}</code>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <span>Start: {formatDateTime(row.context.startsAt)}</span>
                        <span>End: {formatDateTime(row.context.endsAt)}</span>
                        <StatusPill status={row.scheduleStatus} />
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <strong>{row.title || "Assigned worksheet"}</strong>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {row.totalQuestions || 0} questions · {formatDuration(row.durationSeconds)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <StatusPill status={row.attemptStatus} />
                        <span className="muted" style={{ fontSize: 12 }}>
                          {row.attemptsUsed}/{row.attemptLimit} attempts used
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "grid", gap: 3 }}>
                        <StatusPill
                          label={row.resultStatus === "PUBLISHED" ? "Published" : "Not Published"}
                          status={row.resultStatus === "PUBLISHED" ? "PUBLISHED" : "PENDING"}
                        />
                        {row.resultStatus === "PUBLISHED" && row.context.score != null ? (
                          <div style={{ display: "grid", gap: 2 }}>
                            <strong>Score: {Number(row.context.score).toFixed(2)}</strong>
                            <span>Level rank: {row.context.rank ?? "—"}</span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {participantStatus !== "ACTIVE" ? (
                        <button className="button secondary" disabled style={{ width: "auto" }} type="button">
                          Not Eligible
                        </button>
                      ) : row.attemptStatus === "IN_PROGRESS" && row.scheduleStatus === "OPEN" ? (
                        <Link
                          className="button"
                          rel="noopener noreferrer"
                          style={{ width: "auto" }}
                          target="_blank"
                          to={attemptUrl}
                        >
                          Resume
                        </Link>
                      ) : row.canAttempt ? (
                        <Link
                          className="button"
                          rel="noopener noreferrer"
                          style={{ width: "auto" }}
                          target="_blank"
                          to={attemptUrl}
                        >
                          Start
                        </Link>
                      ) : row.scheduleStatus === "UPCOMING" ? (
                        <button className="button secondary" disabled style={{ width: "auto" }} type="button">
                          Upcoming
                        </button>
                      ) : row.scheduleStatus === "CLOSED" ? (
                        <button className="button secondary" disabled style={{ width: "auto" }} type="button">
                          Closed
                        </button>
                      ) : (
                        <button className="button secondary" disabled style={{ width: "auto" }} type="button">
                          {toLabel(row.attemptStatus) || "Unavailable"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export { StudentCompetitionPage };
