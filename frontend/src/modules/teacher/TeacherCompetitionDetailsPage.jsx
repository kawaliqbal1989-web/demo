import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { CompetitionWorkflowTimeline } from "../../components/CompetitionWorkflowTimeline";
import { getCompetitionDetail } from "../../services/competitionsService";
import { listLevels } from "../../services/levelsService";

function formatDateValue(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
}

function getCompetitionStatusBucket(row) {
  const now = Date.now();
  const registrationStart = row?.registrationStartsAt ? new Date(row.registrationStartsAt).getTime() : null;
  const registrationEnd = row?.registrationEndsAt ? new Date(row.registrationEndsAt).getTime() : null;
  const competitionStart = row?.startsAt ? new Date(row.startsAt).getTime() : null;
  const competitionEnd = row?.endsAt ? new Date(row.endsAt).getTime() : null;

  if (row?.status === "ARCHIVED" || row?.isArchived) {
    return "ARCHIVED";
  }
  if (row?.status === "DRAFT") {
    return "DRAFT";
  }
  if (registrationStart && registrationEnd && now >= registrationStart && now <= registrationEnd) {
    return "ENROLLMENT_OPEN";
  }
  if (competitionStart && competitionEnd && now >= competitionStart && now <= competitionEnd) {
    return "RUNNING";
  }
  if (competitionEnd && now > competitionEnd) {
    return "COMPLETED";
  }
  if (row?.status === "SCHEDULED" || row?.workflowStage === "APPROVED" || row?.status === "ACTIVE") {
    return "PUBLISHED";
  }
  return "PUBLISHED";
}

function TeacherCompetitionDetailsPage() {
  const navigate = useNavigate();
  const { competitionId } = useParams();
  const [competition, setCompetition] = useState(null);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;

    async function loadCompetition() {
      try {
        const response = await getCompetitionDetail(competitionId);
        if (!ignore) {
          setCompetition(response?.data || null);
        }
      } catch (err) {
        if (!ignore) {
          setError(err?.message || "Failed to load competition details.");
        }
      }
    }

    async function loadLevels() {
      try {
        const response = await listLevels({ limit: 100, offset: 0 });
        if (!ignore) {
          const items = Array.isArray(response?.data?.items)
            ? response.data.items
            : Array.isArray(response?.data)
              ? response.data
              : [];
          setLevels(items);
        }
      } catch (err) {
        if (!ignore) {
          setLevels([]);
        }
      }
    }

    if (competitionId) {
      setLoading(true);
      setError("");
      void Promise.allSettled([loadCompetition(), loadLevels()]).finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    }

    return () => {
      ignore = true;
    };
  }, [competitionId]);

  const stats = useMemo(() => [
    { label: "Competition Name", value: competition?.title || "—" },
    { label: "Competition Code", value: competition?.code || "—" }
  ], [competition]);

  const infoItems = useMemo(() => [
    { label: "Description", value: competition?.description || "—" },
    { label: "Enrollment Window", value: `${competition?.registrationStartsAt ? formatDateValue(competition.registrationStartsAt) : "—"} → ${competition?.registrationEndsAt ? formatDateValue(competition.registrationEndsAt) : "—"}` },
    { label: "Practice Window", value: competition?.practiceStartsAt || competition?.practiceEndsAt ? `${competition?.practiceStartsAt ? formatDateValue(competition.practiceStartsAt) : "—"} → ${competition?.practiceEndsAt ? formatDateValue(competition.practiceEndsAt) : "—"}` : "—" },
    { label: "Competition Window", value: `${competition?.startsAt ? formatDateValue(competition.startsAt) : "—"} → ${competition?.endsAt ? formatDateValue(competition.endsAt) : "—"}` },
    { label: "Attempt Limit", value: competition?.attemptLimit ?? "—" }
  ], [competition]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>Teacher Competition Workspace</div>
            <h2 style={{ margin: "4px 0 0" }}>{competition?.title || "Competition Details"}</h2>
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{competition?.code || "—"}</div>
              <div style={{ marginTop: 8 }}>
                <CompetitionWorkflowTimeline competition={competition} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(() => {
              const now = new Date();
              const registrationStart = competition?.registrationStartsAt ? new Date(competition.registrationStartsAt) : null;
              const registrationEnd = competition?.registrationEndsAt ? new Date(competition.registrationEndsAt) : null;
              const isEnrollmentOpen = registrationStart && registrationEnd && now >= registrationStart && now <= registrationEnd;
              return isEnrollmentOpen ? (
                <button className="button" style={{ width: "auto" }} type="button" onClick={() => navigate(`/teacher/competitions/${competitionId}/register`)}>
                  Register Students
                </button>
              ) : null;
            })()}
            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>
        </div>

        {loading ? (
          <LoadingState label="Loading competition details..." />
        ) : error ? (
          <EmptyState icon="⚠️" title="Unable to load competition" description={error} />
        ) : (
          <div style={{ display: "grid", gap: 20 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Competition Summary</div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {stats.map((item) => (
                  <div key={item.label} className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>{item.label}</div>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{typeof item.value === "string" ? item.value : item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Competition Information</div>
              <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
                {infoItems.map((item) => (
                  <div key={item.label} className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>{item.label}</div>
                    <div style={{ fontSize: 14, color: "var(--color-text-primary)" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Competition Levels</div>
              {levels.length ? (
                <div className="card" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                        <th style={{ padding: 10 }}>Level Name</th>
                        <th style={{ padding: 10 }}>Description</th>
                        <th style={{ padding: 10 }}>Registered Students</th>
                      </tr>
                    </thead>
                    <tbody>
                      {levels.map((level) => (
                        <tr key={level.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: 10 }}>{level.name || "—"}</td>
                          <td style={{ padding: 10 }}>{level.description || "—"}</td>
                          <td style={{ padding: 10 }}>0</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="card" style={{ padding: 16, color: "var(--color-text-muted)" }}>No competition levels available.</div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Important Notices</div>
              <div className="card" style={{ padding: 16, display: "grid", gap: 8 }}>
                <div style={{ fontWeight: 700 }}>Upcoming Features</div>
                <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
                  <li>Student Registration</li>
                  <li>Competition Level Mapping</li>
                  <li>Temporary Competition Students</li>
                </ul>
                <div style={{ color: "var(--color-text-muted)" }}>Coming Soon</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { TeacherCompetitionDetailsPage };
