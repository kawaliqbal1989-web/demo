import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { PaginationBar } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { listCompetitions } from "../../services/competitionsService";

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "ACTIVE", label: "Active" },
  { value: "COMPLETED", label: "Completed" }
];

function formatDateRange(start, end) {
  const startText = start ? new Date(start).toLocaleDateString() : "—";
  const endText = end ? new Date(end).toLocaleDateString() : "—";
  return `${startText} — ${endText}`;
}

function formatLevels(course) {
  const levels = Array.isArray(course?.levels) ? course.levels : [];
  if (!levels.length) return "—";
  return levels
    .map((level) => level.title || `Level ${level.levelNumber}`)
    .filter(Boolean)
    .join(", ");
}

function CenterCompetitionsPage() {
  const navigate = useNavigate();
  const [competitions, setCompetitions] = useState([]);
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async ({ nextLimit = limit, nextOffset = offset, nextSearch = search, nextStatus = status } = {}) => {
    setLoading(true);
    setError("");
    try {
      const response = await listCompetitions({
        limit: nextLimit,
        offset: nextOffset,
        q: nextSearch.trim() || undefined,
        status: nextStatus !== "ALL" ? nextStatus : undefined
      });

      const items = response?.data?.data?.items
        ?? response?.data?.items
        ?? response?.data?.data
        ?? response?.data
        ?? response?.items
        ?? response
        ?? [];
      setCompetitions(Array.isArray(items) ? items : []);
      setTotal(Number(response?.data?.data?.total ?? response?.data?.total ?? response?.total ?? items.length ?? 0));
      setLimit(nextLimit);
      setOffset(nextOffset);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load competitions");
      setCompetitions([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emptyMessage = useMemo(() => {
    if (search.trim()) {
      return `No competitions match "${search.trim()}".`;
    }
    if (status !== "ALL") {
      return `No ${STATUS_OPTIONS.find((option) => option.value === status)?.label.toLowerCase() || "matching"} competitions are currently available.`;
    }
    return "No eligible competitions are available for this center yet.";
  }, [search, status]);

  const rows = useMemo(
    () =>
      competitions.map((competition) => {
        const levels = Array.isArray(competition?.competitionCourse?.levels) ? competition.competitionCourse.levels : [];
        return {
          id: competition.id,
          name: competition.title || "—",
          code: competition.code || "—",
          course: competition.competitionCourse?.name || "—",
          levels: formatLevels(competition.competitionCourse),
          enrollmentWindow: formatDateRange(competition.registrationStartsAt, competition.registrationEndsAt),
          competitionWindow: formatDateRange(competition.startsAt, competition.endsAt),
          competitionStatus: competition.status || "—",
          centerState: competition.centerWorkflowState || competition.workflowStage || "CENTER_REVIEW",
          centerSubmissionStatus: competition.centerSubmissionStatus || "—",
          centerSubmittedAt: competition.centerSubmittedAt || null,
          registeredStudentsCount: Number(competition.registeredStudentsCount || competition.enrollments?.length || 0),
          temporaryStudentCount: Number(competition.temporaryStudentCount || 0),
          approvedSubmissionCount: Number(competition.approvedSubmissionCount || 0),
          rejectedSubmissionCount: Number(competition.rejectedSubmissionCount || 0),
          returnedSubmissionCount: Number(competition.returnedSubmissionCount || 0),
          centerSubmissionRemark: competition.centerSubmissionRemark || "—",
          eligibleLevelCount: levels.length
        };
      }),
    [competitions]
  );

  const hasRows = rows.length > 0;

  if (loading && !hasRows) {
    return <LoadingState label="Loading competitions..." />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Competitions</h2>
            <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>Center scoped competition workspace</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
              Refresh
            </button>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input
            className="input"
            placeholder="Search competitions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void load({ nextOffset: 0, nextSearch: event.currentTarget.value, nextStatus: status });
              }
            }}
          />
          <select
            className="input"
            value={status}
            onChange={(event) => {
              const nextStatus = event.target.value;
              setStatus(nextStatus);
              setOffset(0);
              void load({ nextOffset: 0, nextSearch: search, nextStatus });
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        {hasRows ? (
          <table style={{ width: "100%", minWidth: 1400, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: 10 }}>Competition</th>
                <th style={{ padding: 10 }}>Code</th>
                <th style={{ padding: 10 }}>Course</th>
                <th style={{ padding: 10 }}>Eligible Levels</th>
                <th style={{ padding: 10 }}>Enrollment Window</th>
                <th style={{ padding: 10 }}>Competition Window</th>
                <th style={{ padding: 10 }}>Competition Status</th>
                <th style={{ padding: 10 }}>Center Stage</th>
                <th style={{ padding: 10 }}>Submission Status</th>
                <th style={{ padding: 10 }}>Registered</th>
                <th style={{ padding: 10 }}>Temporary</th>
                <th style={{ padding: 10 }}>Approved</th>
                <th style={{ padding: 10 }}>Returned</th>
                <th style={{ padding: 10 }}>Rejected</th>
                <th style={{ padding: 10 }}>Return Reason</th>
                <th style={{ padding: 10 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 10, whiteSpace: "normal", wordBreak: "break-word" }}>{row.name}</td>
                  <td style={{ padding: 10 }}>{row.code}</td>
                  <td style={{ padding: 10 }}>{row.course}</td>
                  <td style={{ padding: 10, maxWidth: 220, whiteSpace: "normal", wordBreak: "break-word" }}>{row.levels}</td>
                  <td style={{ padding: 10 }}>{row.enrollmentWindow}</td>
                  <td style={{ padding: 10 }}>{row.competitionWindow}</td>
                  <td style={{ padding: 10 }}><StatusBadge status={row.competitionStatus} /></td>
                  <td style={{ padding: 10 }}><StatusBadge status={row.centerState} /></td>
                  <td style={{ padding: 10 }}><StatusBadge status={row.centerSubmissionStatus} /></td>
                  <td style={{ padding: 10 }}>{row.registeredStudentsCount}</td>
                  <td style={{ padding: 10 }}>{row.temporaryStudentCount}</td>
                  <td style={{ padding: 10 }}>{row.approvedSubmissionCount}</td>
                  <td style={{ padding: 10 }}>{row.returnedSubmissionCount}</td>
                  <td style={{ padding: 10 }}>{row.rejectedSubmissionCount}</td>
                  <td style={{ padding: 10, maxWidth: 220, whiteSpace: "normal", wordBreak: "break-word" }}>{row.centerSubmissionRemark}</td>
                  <td style={{ padding: 10 }}>
                    <button
                      className="button primary"
                      type="button"
                      onClick={() => navigate(`/center/competitions/${row.id}`)}
                      style={{ width: "auto" }}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 24 }}>
            <EmptyState icon="🏆" title="No competitions" description={emptyMessage} />
          </div>
        )}
      </div>

      {total > 0 ? (
        <PaginationBar
          limit={limit}
          offset={offset}
          count={rows.length}
          total={total}
          onChange={(next) => {
            setLimit(next.limit);
            setOffset(next.offset);
            void load({ nextLimit: next.limit, nextOffset: next.offset, nextSearch: search, nextStatus: status });
          }}
        />
      ) : null}
    </section>
  );
}

export { CenterCompetitionsPage };
export default CenterCompetitionsPage;
