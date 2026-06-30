import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { CompetitionWorkflowTimeline } from "../../components/CompetitionWorkflowTimeline";
import { getCompetitionDetail, listCompetitions } from "../../services/competitionsService";
import {
  approvePartnerCompetitionFranchise,
  getPartnerCompetitionFranchiseDetail,
  listPartnerCompetitionFranchises,
  returnPartnerCompetitionFranchise,
  submitPartnerCompetition
} from "../../services/partnerService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function formatCompetitionStatus(value) {
  if (!value) return "—";
  return value;
}

function getRegistrationStatus(competition) {
  const now = Date.now();
  const registrationStart = competition?.registrationStartsAt ? new Date(competition.registrationStartsAt).getTime() : null;
  const registrationEnd = competition?.registrationEndsAt ? new Date(competition.registrationEndsAt).getTime() : null;

  if (!registrationStart || !registrationEnd) return "Not available";
  if (now < registrationStart) return "Scheduled";
  if (now > registrationEnd) return "Closed";
  return "Open";
}

function unwrapApiData(response) {
  return response?.data?.data ?? response?.data ?? response ?? null;
}

function normalizeArrayResponse(response, keys = ["items", "franchises", "data"]) {
  const payload = unwrapApiData(response);

  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return Array.isArray(payload) ? payload : [];
}

const REVIEW_TABLE_STYLE = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
  minWidth: 720
};

const REVIEW_TH_STYLE = {
  padding: "10px 12px",
  textAlign: "left",
  borderBottom: "1px solid var(--color-border-divider)",
  color: "var(--color-text-muted)",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".04em",
  whiteSpace: "nowrap",
  verticalAlign: "top"
};

const REVIEW_TD_STYLE = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--color-border-divider)",
  verticalAlign: "top",
  whiteSpace: "nowrap"
};

function BusinessPartnerCompetitionsPage() {
  const [competitions, setCompetitions] = useState([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [selectedCompetition, setSelectedCompetition] = useState(null);
  const [franchises, setFranchises] = useState([]);
  const [franchiseSummary, setFranchiseSummary] = useState(null);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState("");
  const [selectedFranchiseDetail, setSelectedFranchiseDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [franchiseLoading, setFranchiseLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");

  const loadFranchiseDetail = async (competitionId, franchiseId) => {
    if (!competitionId || !franchiseId) {
      setSelectedFranchiseDetail(null);
      return;
    }

    setFranchiseLoading(true);
    try {
      const detailResponse = await getPartnerCompetitionFranchiseDetail(competitionId, franchiseId);
      setSelectedFranchiseDetail(detailResponse?.data || null);
    } catch (err) {
      setSelectedFranchiseDetail(null);
      setError(getFriendlyErrorMessage(err) || "Failed to load franchise detail.");
    } finally {
      setFranchiseLoading(false);
    }
  };

  const loadCompetitionBundle = async (competitionId, fallbackCompetition = null) => {
    if (!competitionId) {
      setSelectedCompetition(null);
      setFranchises([]);
      setFranchiseSummary(null);
      setSelectedFranchiseId("");
      setSelectedFranchiseDetail(null);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [competitionResponse, franchiseResponse] = await Promise.all([
        getCompetitionDetail(competitionId),
        listPartnerCompetitionFranchises(competitionId, { limit: 200, offset: 0 })
      ]);

      const competitionData = unwrapApiData(competitionResponse) || fallbackCompetition || null;
      const franchiseData = unwrapApiData(franchiseResponse) || {};
      const franchiseRows = normalizeArrayResponse(franchiseResponse, ["franchises", "items"]);
      const nextFranchiseId = franchiseRows[0]?.franchiseId || franchiseRows[0]?.id || "";

      setSelectedCompetition(competitionData);
      setFranchiseSummary(franchiseData.summary || null);
      setFranchises(franchiseRows);
      setSelectedFranchiseId(nextFranchiseId);

      if (nextFranchiseId) {
        await loadFranchiseDetail(competitionId, nextFranchiseId);
      } else {
        setSelectedFranchiseDetail(null);
      }
    } catch (err) {
      setSelectedCompetition(fallbackCompetition);
      setFranchises([]);
      setFranchiseSummary(null);
      setSelectedFranchiseDetail(null);
      setError(getFriendlyErrorMessage(err) || "Failed to load competitions.");
    } finally {
      setLoading(false);
    }
  };

  const loadCompetitions = async () => {
    setLoading(true);
    setError("");
    try {
      const competitionResponse = await listCompetitions({ limit: 50, offset: 0 });
      const items = normalizeArrayResponse(competitionResponse, ["items", "competitions", "data"]);
      setCompetitions(items);

      if (items.length) {
        const nextCompetition = items.find((competition) => competition.id === selectedCompetitionId) || items[0];
        setSelectedCompetitionId(nextCompetition.id);
        await loadCompetitionBundle(nextCompetition.id, nextCompetition || null);
      } else {
        setSelectedCompetitionId("");
        setSelectedCompetition(null);
        setFranchises([]);
        setFranchiseSummary(null);
        setSelectedFranchiseId("");
        setSelectedFranchiseDetail(null);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCompetitions();
  }, []);

  const handleCompetitionChange = async (event) => {
    const nextCompetitionId = event.target.value;
    setSelectedCompetitionId(nextCompetitionId);
    const fallbackCompetition = competitions.find((competition) => competition.id === nextCompetitionId) || null;
    await loadCompetitionBundle(nextCompetitionId, fallbackCompetition);
  };

  const handleFranchiseChange = async (event) => {
    const nextFranchiseId = event.target.value;
    setSelectedFranchiseId(nextFranchiseId);
    await loadFranchiseDetail(selectedCompetitionId, nextFranchiseId);
  };

  const handleReturnFranchise = async (franchiseId) => {
    if (!selectedCompetitionId || !franchiseId) return;
    const remark = window.prompt("Reason for returning this franchise for edits:");
    if (!remark || !remark.trim()) return;

    setActionLoading(`return:${franchiseId}`);
    try {
      await returnPartnerCompetitionFranchise(selectedCompetitionId, franchiseId, { remark: remark.trim() });
      toast.success("Franchise returned for edits.");
      await loadCompetitionBundle(selectedCompetitionId, selectedCompetition);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to return franchise.");
    } finally {
      setActionLoading("");
    }
  };

  const handleApproveFranchise = async (franchiseId) => {
    if (!selectedCompetitionId || !franchiseId) return;

    setActionLoading(`approve:${franchiseId}`);
    try {
      await approvePartnerCompetitionFranchise(selectedCompetitionId, franchiseId);
      toast.success("Franchise approved.");
      await loadCompetitionBundle(selectedCompetitionId, selectedCompetition);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to approve franchise.");
    } finally {
      setActionLoading("");
    }
  };

  const handleSubmitCompetition = async () => {
    if (!selectedCompetitionId) return;

    setActionLoading("submit");
    try {
      await submitPartnerCompetition(selectedCompetitionId);
      toast.success("Competition submitted to super admin.");
      await loadCompetitionBundle(selectedCompetitionId, selectedCompetition);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to submit competition.");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) {
    return <LoadingState label="Loading competitions..." />;
  }

  const summaryCards = [
    { label: "Assigned Franchises", value: selectedCompetition?.assignedFranchisesCount ?? 0 },
    { label: "Centers", value: selectedCompetition?.assignedCentersCount ?? 0 },
    { label: "Teachers", value: selectedCompetition?.assignedTeachersCount ?? 0 },
    { label: "Registered Students", value: selectedCompetition?.registeredStudentsCount ?? 0 },
    { label: "Pending Approval", value: selectedCompetition?.pendingApprovalCount ?? 0 },
    { label: "Approved Students", value: selectedCompetition?.approvedStudentsCount ?? 0 }
  ];

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Business Partner Competitions</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
            Monitor franchise registrations and approvals without student registration controls.
          </div>
        </div>
      </div>

      {error ? <div className="card" style={{ padding: 16, color: "var(--color-text-danger)" }}>{error}</div> : null}

      <div className="card" style={{ display: "grid", gap: 12, padding: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Select Competition</span>
          <select className="select" value={selectedCompetitionId} onChange={handleCompetitionChange} disabled={!competitions.length}>
            <option value="">{competitions.length ? "Select a competition" : "No competitions available"}</option>
            {competitions.map((competition) => (
              <option key={competition.id} value={competition.id}>
                {competition.title} ({competition.code || competition.id})
              </option>
            ))}
          </select>
        </label>

        {selectedCompetition ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Competition Name</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedCompetition.title || "—"}</div>
            </div>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Competition Code</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{selectedCompetition.code || "—"}</div>
            </div>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6, minWidth: 0, overflow: "hidden" }}>
              <CompetitionWorkflowTimeline competition={selectedCompetition} style={{ width: "100%", minWidth: 0 }} />
            </div>
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>Registration Status</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{getRegistrationStatus(selectedCompetition)}</div>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 20, textAlign: "center", color: "var(--color-text-muted)" }}>
            Select a competition to view its dashboard.
          </div>
        )}
      </div>

      {selectedCompetition ? (
        <>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            {summaryCards.map((card) => (
              <div key={card.label} className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--color-text-muted)" }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{card.value}</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Franchise Review</div>
              <button className="button secondary" type="button" onClick={() => void loadCompetitionBundle(selectedCompetitionId, selectedCompetition)} style={{ width: "auto" }}>
                Refresh Review
              </button>
            </div>

            {franchiseSummary ? (
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Submitted Franchises</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{franchiseSummary.submittedFranchises ?? 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Approved Franchises</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{franchiseSummary.approvedFranchises ?? 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Returned Franchises</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{franchiseSummary.returnedFranchises ?? 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total Students</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{franchiseSummary.totalStudents ?? 0}</div>
                </div>
              </div>
            ) : null}

            {franchises.length ? (
              <div style={{ display: "grid", gap: 12 }}>
                <label style={{ display: "grid", gap: 6, maxWidth: 420 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Select Franchise</span>
                  <select className="select" value={selectedFranchiseId} onChange={handleFranchiseChange}>
                    {franchises.map((franchise) => {
                      const franchiseId = franchise.franchiseId || franchise.id;
                      return (
                        <option key={franchiseId} value={franchiseId}>
                          {franchise.franchiseName || franchise.name || franchiseId} ({franchise.status || "PENDING"})
                        </option>
                      );
                    })}
                  </select>
                </label>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ ...REVIEW_TABLE_STYLE, minWidth: 840 }}>
                    <thead>
                      <tr>
                        <th style={REVIEW_TH_STYLE}>Franchise</th>
                        <th style={REVIEW_TH_STYLE}>Centers</th>
                        <th style={REVIEW_TH_STYLE}>Students</th>
                        <th style={REVIEW_TH_STYLE}>Temp Students</th>
                        <th style={REVIEW_TH_STYLE}>Status</th>
                        <th style={REVIEW_TH_STYLE}>Submitted</th>
                        <th style={REVIEW_TH_STYLE}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {franchises.map((franchise) => {
                        const franchiseId = franchise.franchiseId || franchise.id;
                        const isSelected = franchiseId === selectedFranchiseId;
                        const busy = actionLoading === `return:${franchiseId}` || actionLoading === `approve:${franchiseId}`;
                        return (
                          <tr key={franchiseId} style={isSelected ? { background: "rgba(59,130,246,0.06)" } : undefined}>
                            <td style={REVIEW_TD_STYLE}>{franchise.franchiseName || franchise.name || franchiseId}</td>
                            <td style={REVIEW_TD_STYLE}>{franchise.centers ?? 0}</td>
                            <td style={REVIEW_TD_STYLE}>{franchise.students ?? 0}</td>
                            <td style={REVIEW_TD_STYLE}>{franchise.temporaryStudents ?? 0}</td>
                            <td style={REVIEW_TD_STYLE}>{franchise.status || "PENDING"}</td>
                            <td style={REVIEW_TD_STYLE}>{franchise.submissionDate ? new Date(franchise.submissionDate).toLocaleString() : "—"}</td>
                            <td style={REVIEW_TD_STYLE}>
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button className="button secondary" type="button" disabled={busy} onClick={() => void handleFranchiseChange({ target: { value: franchiseId } })} style={{ width: "auto" }}>
                                  View
                                </button>
                                <button className="button secondary" type="button" disabled={busy || franchise.status === "RETURNED"} onClick={() => void handleReturnFranchise(franchiseId)} style={{ width: "auto" }}>
                                  Return
                                </button>
                                <button className="button" type="button" disabled={busy || franchise.status !== "SUBMITTED"} onClick={() => void handleApproveFranchise(franchiseId)} style={{ width: "auto" }}>
                                  Approve
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div style={{ color: "var(--color-text-muted)" }}>No franchise registration rows are available yet.</div>
            )}
          </div>

          {selectedFranchiseDetail ? (
            <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Franchise Detail</div>
                <button className="button" type="button" disabled={actionLoading === "submit"} onClick={() => void handleSubmitCompetition()} style={{ width: "auto" }}>
                  {actionLoading === "submit" ? "Submitting..." : "Submit Competition"}
                </button>
              </div>

              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Centers</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedFranchiseDetail.centers?.length ?? 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Registrations</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedFranchiseDetail.registrations?.length ?? 0}</div>
                </div>
                <div className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Temporary Students</div>
                  <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedFranchiseDetail.temporaryStudents?.length ?? 0}</div>
                </div>
              </div>

              {franchiseLoading ? <div style={{ color: "var(--color-text-muted)" }}>Loading franchise detail...</div> : null}

              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Centers</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...REVIEW_TABLE_STYLE, minWidth: 520 }}>
                      <thead>
                        <tr>
                          <th style={REVIEW_TH_STYLE}>Center</th>
                          <th style={REVIEW_TH_STYLE}>Students</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedFranchiseDetail.centers || []).map((center) => (
                          <tr key={center.id}>
                            <td style={REVIEW_TD_STYLE}>{center.name || center.id}</td>
                            <td style={REVIEW_TD_STYLE}>{selectedFranchiseDetail.registrations?.filter((registration) => registration.student?.hierarchyNodeId === center.id).length ?? 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Registrations</div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ ...REVIEW_TABLE_STYLE, minWidth: 640 }}>
                      <thead>
                        <tr>
                          <th style={REVIEW_TH_STYLE}>Student</th>
                          <th style={REVIEW_TH_STYLE}>Level</th>
                          <th style={REVIEW_TH_STYLE}>Temporary</th>
                          <th style={REVIEW_TH_STYLE}>Enrolled At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedFranchiseDetail.registrations || []).map((registration, index) => (
                          <tr key={`${registration.student?.id || index}-${registration.enrolledAt || index}`}>
                            <td style={REVIEW_TD_STYLE}>
                              {registration.student?.firstName || ""} {registration.student?.lastName || ""}
                            </td>
                            <td style={REVIEW_TD_STYLE}>{registration.levelId || "—"}</td>
                            <td style={REVIEW_TD_STYLE}>{registration.student?.isTemporaryExam ? "Yes" : "No"}</td>
                            <td style={REVIEW_TD_STYLE}>{registration.enrolledAt ? new Date(registration.enrolledAt).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export { BusinessPartnerCompetitionsPage };
