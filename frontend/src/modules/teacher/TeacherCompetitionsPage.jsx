import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { LoadingState } from "../../components/LoadingState";
import { PaginationBar } from "../../components/DataTable";
import { StatusBadge } from "../../components/StatusBadge";
import { listCompetitions } from "../../services/competitionsService";
import { getAnalyticsCompetitions } from "../../services/teacherPortalService";

function formatDateRange(start, end) {
  const startText = start ? new Date(start).toLocaleDateString() : "-";
  const endText = end ? new Date(end).toLocaleDateString() : "-";
  return `${startText} - ${endText}`;
}

function unwrapCompetitionRows(response) {
  const payload =
    response && typeof response === "object"
      ? Array.isArray(response.items) || response.summary
        ? response
        : response.data && typeof response.data === "object"
          ? response.data
          : response
      : {};

  const items = Array.isArray(payload?.items) ? payload.items : [];

  return {
    summary: payload?.summary || null,
    items
  };
}

function unwrapCompetitionList(response) {
  const payload = response?.data?.data || response?.data || response || {};
  const items = Array.isArray(payload?.items)
    ? payload.items
    : Array.isArray(response?.items)
      ? response.items
      : [];

  return {
    items,
    total: Number(payload?.total ?? response?.total ?? items.length)
  };
}

function formatLevels(detail, fallbackLevels = []) {
  const courseLevels = Array.isArray(detail?.competitionCourse?.levels) ? detail.competitionCourse.levels : [];

  if (courseLevels.length) {
    return courseLevels
      .map((level) => level.title || `Level ${level.levelNumber}`)
      .filter(Boolean)
      .join(", ");
  }

  if (fallbackLevels.length) {
    return [...new Set(fallbackLevels)].filter(Boolean).join(", ");
  }

  return "-";
}

function getLifecycleStatus(competition) {
  if (!competition) return "-";
  return competition.workflowStage || competition.status || "-";
}

function isTeacherVisibleCompetition(competition) {
  const status = String(competition?.status || "").toUpperCase();
  const workflowStage = String(competition?.workflowStage || "").toUpperCase();
  if (status === "DRAFT" || status === "ARCHIVED" || status === "COMPLETED") return false;
  return status === "SCHEDULED" || status === "ACTIVE" || workflowStage === "APPROVED";
}

function TeacherCompetitionsPage() {
  const [competitionGroups, setCompetitionGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [limit, setLimit] = useState(10);
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");

    try {
      const [competitionsResponse, analyticsResponse] = await Promise.all([
        listCompetitions({ limit: 1000, offset: 0 }),
        getAnalyticsCompetitions({ limit: 1000, offset: 0 })
      ]);
      const { items: rawCompetitions } = unwrapCompetitionList(competitionsResponse);
      const competitions = rawCompetitions.filter(isTeacherVisibleCompetition);
      const { summary: nextSummary, items } = unwrapCompetitionRows(analyticsResponse);

      if (!competitions.length) {
        setCompetitionGroups([]);
        setSummary({ ...(nextSummary || {}), totalCompetitions: 0 });
        return;
      }

      const grouped = new Map();
      for (const row of items) {
        const competitionId = row?.competitionId ? String(row.competitionId) : "";
        if (!competitionId) continue;
        if (!grouped.has(competitionId)) {
          grouped.set(competitionId, []);
        }
        grouped.get(competitionId).push(row);
      }

      const nextRows = competitions.map((competition) => {
        const competitionId = String(competition.id || "");
        const rows = grouped.get(competitionId) || [];
        const uniqueStudentIds = [...new Set(rows.map((row) => row?.studentId).filter(Boolean))];
        const uniqueLevels = [
          ...new Set([
            ...rows.map((row) => row?.levelName).filter(Boolean),
            competition?.level?.name
          ].filter(Boolean))
        ];

        return {
          id: competitionId,
          name: competition?.title || rows[0]?.competitionTitle || "-",
          code: competition?.code || rows[0]?.competitionCode || "-",
          course: competition?.competitionCourse?.name || competition?.template?.name || "-",
          levels: formatLevels(competition, uniqueLevels),
          enrollmentWindow: formatDateRange(competition?.registrationStartsAt, competition?.registrationEndsAt),
          competitionWindow: formatDateRange(competition?.startsAt, competition?.endsAt),
          competitionStatus: getLifecycleStatus(competition),
          assignedStudentCount: uniqueStudentIds.length || Number(competition?.assignedStudentsCount || competition?.registeredStudentsCount || 0),
          registeredStudentCount: uniqueStudentIds.length || Number(competition?.registeredStudentsCount || 0),
          worksheetAssignedCount: Number(competition?.worksheets?.length || 0),
          notStartedCount: 0,
          startedCount: 0,
          submittedCount: 0,
          publishedResultCount: rows.filter((row) => row?.rank != null || row?.totalScore != null).length
        };
      });

      setCompetitionGroups(nextRows);
      setSummary({ ...(nextSummary || {}), totalCompetitions: nextRows.length });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Competition data could not be loaded.");
      setCompetitionGroups([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return competitionGroups.filter((row) => {
      const matchesSearch =
        !q ||
        [row.name, row.code, row.course, row.levels, row.competitionStatus]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));

      const matchesStatus = statusFilter === "ALL" || String(row.competitionStatus || "").toUpperCase() === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [competitionGroups, search, statusFilter]);

  const pagedRows = useMemo(() => filteredRows.slice(offset, offset + limit), [filteredRows, offset, limit]);

  useEffect(() => {
    if (offset >= filteredRows.length && filteredRows.length > 0) {
      setOffset(0);
    }
  }, [filteredRows.length, offset]);

  if (loading && !competitionGroups.length) {
    return <LoadingState label="Loading competitions..." />;
  }

  const emptyMessage = error
    ? "Competition data could not be loaded. Refresh to try again."
    : search.trim()
      ? `No competitions match "${search.trim()}".`
      : statusFilter !== "ALL"
        ? `No ${statusFilter.toLowerCase()} competitions are available for students assigned to you.`
        : "No competitions are currently available for your center.";

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Competitions</h2>
            <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>
              Competition workspace for your assigned students
            </div>
          </div>
          <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>

        {summary ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Available Competitions</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.totalCompetitions ?? filteredRows.length}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Enrolled</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.totalEnrolled ?? 0}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Avg Score</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.avgScore ?? 0}</div>
            </div>
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <input
            className="input"
            placeholder="Search competitions"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setOffset(0);
            }}
          />
          <select
            className="input"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              setOffset(0);
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="APPROVED">Approved</option>
            <option value="ENROLLMENT_OPEN">Enrollment Open</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {pagedRows.length ? (
        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 1500, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: 10 }}>Competition Name</th>
                <th style={{ padding: 10 }}>Competition Code</th>
                <th style={{ padding: 10 }}>Course</th>
                <th style={{ padding: 10 }}>Relevant Levels</th>
                <th style={{ padding: 10 }}>Enrollment Window</th>
                <th style={{ padding: 10 }}>Competition Window</th>
                <th style={{ padding: 10 }}>Lifecycle Status</th>
                <th style={{ padding: 10 }}>Assigned Students</th>
                <th style={{ padding: 10 }}>Registered Students</th>
                <th style={{ padding: 10 }}>Worksheet Assigned</th>
                <th style={{ padding: 10 }}>Not Started</th>
                <th style={{ padding: 10 }}>Started</th>
                <th style={{ padding: 10 }}>Submitted</th>
                <th style={{ padding: 10 }}>Published Results</th>
                <th style={{ padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 10, whiteSpace: "normal", wordBreak: "break-word" }}>{row.name}</td>
                  <td style={{ padding: 10 }}>{row.code}</td>
                  <td style={{ padding: 10 }}>{row.course}</td>
                  <td style={{ padding: 10, whiteSpace: "normal", wordBreak: "break-word" }}>{row.levels}</td>
                  <td style={{ padding: 10 }}>{row.enrollmentWindow}</td>
                  <td style={{ padding: 10 }}>{row.competitionWindow}</td>
                  <td style={{ padding: 10 }}>
                    <StatusBadge status={row.competitionStatus} />
                  </td>
                  <td style={{ padding: 10 }}>{row.assignedStudentCount}</td>
                  <td style={{ padding: 10 }}>{row.registeredStudentCount}</td>
                  <td style={{ padding: 10 }}>{row.worksheetAssignedCount}</td>
                  <td style={{ padding: 10 }}>{row.notStartedCount}</td>
                  <td style={{ padding: 10 }}>{row.startedCount}</td>
                  <td style={{ padding: 10 }}>{row.submittedCount}</td>
                  <td style={{ padding: 10 }}>{row.publishedResultCount}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Link className="button secondary" style={{ width: "auto" }} to={`/teacher/competitions/${row.id}`}>
                        View Details
                      </Link>
                      <Link className="button" style={{ width: "auto" }} to={`/teacher/competitions/${row.id}/register`}>
                        Register Students
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon="🏆" title="No competitions available" description={emptyMessage} />
      )}

      {filteredRows.length > 0 ? (
        <PaginationBar
          pageSize={limit}
          currentOffset={offset}
          totalItems={filteredRows.length}
          onPageSizeChange={(nextLimit) => {
            setLimit(nextLimit);
            setOffset(0);
          }}
          onPreviousPage={() => setOffset((current) => Math.max(0, current - limit))}
          onNextPage={() => setOffset((current) => Math.min(filteredRows.length, current + limit))}
          pageSizeOptions={[10, 20, 50]}
        />
      ) : null}
    </section>
  );
}

export { TeacherCompetitionsPage };
export default TeacherCompetitionsPage;
