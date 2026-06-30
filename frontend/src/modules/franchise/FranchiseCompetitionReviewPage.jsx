import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { InputDialog } from "../../components/InputDialog";
import { getCompetitionDetail } from "../../services/competitionsService";
import { CompetitionWorkflowTimeline } from "../../components/CompetitionWorkflowTimeline";
import {
  listFranchiseCompetitionCenters,
  getFranchiseCompetitionCenterDetail,
  returnFranchiseCompetitionCenter,
  approveFranchiseCompetitionCenter,
  submitFranchiseCompetition
} from "../../services/franchiseService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { StatusBadge } from "../../components/StatusBadge";

function FranchiseCompetitionReviewPage() {
  const { competitionId } = useParams();
  const [competition, setCompetition] = useState(null);
  const [centers, setCenters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailCenter, setDetailCenter] = useState(null);
  const [returnTarget, setReturnTarget] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const detailResp = await getCompetitionDetail(competitionId);
      setCompetition(detailResp?.data || null);

      const centersResp = await listFranchiseCompetitionCenters(competitionId, { limit: 500, offset: 0 });
      const items = centersResp?.data ?? centersResp ?? [];
      setCenters(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition or centers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [competitionId]);

  const summary = useMemo(() => {
    const totalCenters = centers.length;
    const submitted = centers.filter((c) => String(c.submissionStatus || "").toUpperCase() === "SUBMITTED").length;
    const pending = centers.filter((c) => String(c.submissionStatus || "").toUpperCase() === "PENDING").length;
    const returned = centers.filter((c) => String(c.submissionStatus || "").toUpperCase() === "RETURNED").length;
    const teachers = centers.reduce((s, c) => s + (Number(c.teacherCount) || 0), 0);
    const students = centers.reduce((s, c) => s + (Number(c.studentCount) || 0), 0);
    const temporary = centers.reduce((s, c) => s + (Number(c.temporaryStudentCount) || 0), 0);
    return { totalCenters, submitted, pending, returned, teachers, students, temporary };
  }, [centers]);

  const openCenterDetail = async (center) => {
    setDetailCenter(null);
    setDetailOpen(true);
    try {
      const d = await getFranchiseCompetitionCenterDetail(competitionId, center.id);
      setDetailCenter(d?.data || d || null);
    } catch (err) {
      setDetailCenter(null);
    }
  };

  const executeReturn = async (remark) => {
    const target = returnTarget;
    setReturnTarget(null);
    if (!target) return;
    try {
      await returnFranchiseCompetitionCenter(competitionId, target.id, { remark: remark || "" });
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to return center.");
    }
  };

  const handleApprove = async (center) => {
    try {
      await approveFranchiseCompetitionCenter(competitionId, center.id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to approve center.");
    }
  };

  const handleSubmitToBP = async () => {
    if (!centers.length) return;
    const allApproved = centers.every((c) => String(c.submissionStatus || "").toUpperCase() === "APPROVED");
    if (!allApproved) {
      setError("All centers must be approved before submitting to Business Partner.");
      return;
    }
    setSubmitting(true);
    try {
      await submitFranchiseCompetition(competitionId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit competition to Business Partner.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading competition review..." />;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", color: "var(--color-text-muted)" }}>Franchise Competition Review</div>
            <h2 style={{ margin: "6px 0 0" }}>{competition?.title || "—"}</h2>
            <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>{competition?.code || "—"}</div>
            <div style={{ marginTop: 8 }}>
              <CompetitionWorkflowTimeline competition={competition} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button primary" type="button" onClick={handleSubmitToBP} disabled={submitting || centers.length === 0}>
              {submitting ? "Submitting..." : "Submit to Business Partner"}
            </button>
          </div>
        </div>
        {error ? <div className="error" style={{ marginTop: 8 }}>{error}</div> : null}
      </div>

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Centers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.totalCenters}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Teachers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.teachers}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Registered Students</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.students}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Temporary Students</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.temporary}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Submitted Centers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.submitted}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Pending Centers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.pending}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Returned Centers</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{summary.returned}</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Centers</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: 10 }}>Center Name</th>
                <th style={{ padding: 10 }}>Teachers</th>
                <th style={{ padding: 10 }}>Students</th>
                <th style={{ padding: 10 }}>Temporary Students</th>
                <th style={{ padding: 10 }}>Submission Status</th>
                <th style={{ padding: 10 }}>Submitted Date</th>
                <th style={{ padding: 10 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {centers.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <td style={{ padding: 10 }}>{c.name || "—"}</td>
                  <td style={{ padding: 10 }}>{c.teacherCount ?? 0}</td>
                  <td style={{ padding: 10 }}>{c.studentCount ?? 0}</td>
                  <td style={{ padding: 10 }}>{c.temporaryStudentCount ?? 0}</td>
                  <td style={{ padding: 10 }}><StatusBadge status={c.submissionStatus || ""} /></td>
                  <td style={{ padding: 10 }}>{c.submittedAt ? new Date(c.submittedAt).toLocaleString() : "—"}</td>
                  <td style={{ padding: 10 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="button secondary" type="button" onClick={() => void openCenterDetail(c)} style={{ width: "auto", fontSize: 12 }}>
                        View
                      </button>
                      <button className="button" type="button" onClick={() => setReturnTarget(c)} style={{ width: "auto", fontSize: 12 }}>
                        Return to Center
                      </button>
                      <button className="button primary" type="button" onClick={() => void handleApprove(c)} style={{ width: "auto", fontSize: 12 }}>
                        Approve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Future Workflow</div>
        <div style={{ color: "var(--color-text-muted)" }}>Center → Franchise ✔ → Business Partner → Super Admin</div>
      </div>

      <InputDialog
        open={!!returnTarget}
        title={`Return submission to ${returnTarget?.name || "center"}`}
        message={`Provide a remark to return the submission to the center.`}
        inputLabel="Remark (required)"
        inputPlaceholder="Enter remark..."
        inputType="textarea"
        confirmLabel="Return"
        onCancel={() => setReturnTarget(null)}
        onConfirm={(val) => void executeReturn(val)}
      />

      {/* Center detail modal (read-only) */}
      {detailOpen ? (
        <div className="modal" style={{ display: "block" }} onClick={() => setDetailOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <h3 style={{ marginTop: 0 }}>Center Submission - {detailCenter?.center?.name || "—"}</h3>
            <div style={{ color: "var(--color-text-muted)", marginBottom: 12 }}>Read-only view of registrations</div>
            {detailCenter?.teacherSummaries?.length ? (
              <div>
                {detailCenter.teacherSummaries.map((t) => (
                  <div key={t.teacherId} className="card" style={{ padding: 12, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700 }}>{t.teacherName}</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t.registrationCount} registrations</div>
                    {t.registrations?.length ? (
                      <table style={{ width: "100%", marginTop: 8 }}>
                        <thead>
                          <tr style={{ textAlign: "left" }}>
                            <th style={{ padding: 6 }}>Student</th>
                            <th style={{ padding: 6 }}>Level</th>
                            <th style={{ padding: 6 }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {t.registrations.map((r) => (
                            <tr key={r.id}>
                              <td style={{ padding: 6 }}>{`${r.student?.firstName || ""} ${r.student?.lastName || ""}`.trim() || "—"}</td>
                              <td style={{ padding: 6 }}>{r.competitionLevel?.name || "—"}</td>
                              <td style={{ padding: 6 }}>{r.registrationStatus || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>No teacher registrations available.</div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="button" onClick={() => setDetailOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { FranchiseCompetitionReviewPage };
