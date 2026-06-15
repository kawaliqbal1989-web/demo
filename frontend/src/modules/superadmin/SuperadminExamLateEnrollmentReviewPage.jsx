import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listLateEnrollmentRequests, reviewLateEnrollmentRequest } from "../../services/examCyclesService";

function SuperadminExamLateEnrollmentReviewPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [decisionMap, setDecisionMap] = useState({});
  const [reviewing, setReviewing] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listLateEnrollmentRequests(examCycleId, { status: "ALL" });
      setRequests(res?.data?.requests || []);
      setCounts(res?.data?.counts || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load late enrollment requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const selectedRequest = useMemo(() => requests.find((request) => request.id === selectedRequestId) || null, [requests, selectedRequestId]);

  const setDecision = (studentId, decision) => {
    setDecisionMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        decision
      }
    }));
  };

  const setDecisionRemark = (studentId, reviewRemarks) => {
    setDecisionMap((prev) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || {}),
        reviewRemarks
      }
    }));
  };

  const submitReview = async () => {
    if (!selectedRequest || reviewing) {
      return;
    }

    const decisions = (selectedRequest.students || [])
      .map((studentRow) => ({
        studentId: studentRow.studentId,
        decision: decisionMap[studentRow.studentId]?.decision,
        reviewRemarks: decisionMap[studentRow.studentId]?.reviewRemarks || ""
      }))
      .filter((item) => item.decision === "APPROVED" || item.decision === "REJECTED");

    if (!decisions.length) {
      setError("Choose at least one student decision.");
      return;
    }

    setReviewing(true);
    setError("");
    try {
      await reviewLateEnrollmentRequest(examCycleId, selectedRequest.id, { decisions });
      setDecisionMap({});
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to review late enrollment request.");
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading late enrollment review..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Superadmin Late Enrollment Review</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Student-wise approval or rejection</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {counts ? (
        <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>Normal: <b>{counts.normalEnrollmentCount}</b></div>
          <div>Late: <b>{counts.lateEnrollmentCount}</b></div>
          <div>Total: <b>{counts.totalEnrollmentCount}</b></div>
        </div>
      ) : null}

      {error ? <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div> : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Requests</h3>
        <DataTable
          keyField="id"
          rows={requests}
          columns={[
            { key: "id", header: "Request", render: (row) => row.id.slice(0, 10) },
            { key: "center", header: "Center", render: (row) => row?.centerNode?.name || "" },
            { key: "status", header: "Status" },
            { key: "submittedAt", header: "Submitted", render: (row) => new Date(row.submittedAt).toLocaleString() },
            { key: "students", header: "Students", render: (row) => row.students?.length || 0 },
            {
              key: "review",
              header: "",
              render: (row) => (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setSelectedRequestId(row.id)}
                  style={{ width: "auto" }}
                >
                  Open
                </button>
              )
            }
          ]}
        />
      </div>

      {selectedRequest ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Request {selectedRequest.id.slice(0, 12)}</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status: {selectedRequest.status}</div>
          </div>

          <DataTable
            keyField="id"
            rows={selectedRequest.students || []}
            columns={[
              { key: "admissionNo", header: "Admission", render: (row) => row?.student?.admissionNo || "" },
              {
                key: "name",
                header: "Student",
                render: (row) => `${row?.student?.firstName || ""} ${row?.student?.lastName || ""}`.trim()
              },
              { key: "level", header: "Level", render: (row) => row?.level?.name || "" },
              { key: "status", header: "Current Status" },
              {
                key: "decision",
                header: "Decision",
                render: (row) => (
                  <select
                    className="input"
                    value={decisionMap[row.studentId]?.decision || ""}
                    onChange={(e) => setDecision(row.studentId, e.target.value)}
                    disabled={["APPROVED", "REJECTED", "EXPIRED"].includes(row.status)}
                    style={{ width: 140 }}
                  >
                    <option value="">No change</option>
                    <option value="APPROVED">Approve</option>
                    <option value="REJECTED">Reject</option>
                  </select>
                )
              },
              {
                key: "remarks",
                header: "Review Remarks",
                render: (row) => (
                  <input
                    className="input"
                    value={decisionMap[row.studentId]?.reviewRemarks || ""}
                    onChange={(e) => setDecisionRemark(row.studentId, e.target.value)}
                    disabled={["APPROVED", "REJECTED", "EXPIRED"].includes(row.status)}
                    style={{ width: 180 }}
                  />
                )
              }
            ]}
          />

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button className="button" type="button" onClick={() => void submitReview()} disabled={reviewing} style={{ width: "auto" }}>
              {reviewing ? "Submitting..." : "Submit Student-wise Review"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { SuperadminExamLateEnrollmentReviewPage };
