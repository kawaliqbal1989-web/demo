import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listCenterReassignmentRequests,
  reviewCenterReassignmentRequest
} from "../../services/centerService";

function CenterReassignmentQueuePage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("PENDING");

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewAction, setReviewAction] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await listCenterReassignmentRequests({ status: filter || undefined });
      const items = resp?.data?.items || resp?.data || resp || [];
      setRequests(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load reassignment requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleReview = async () => {
    if (!reviewTarget || !reviewAction) return;
    setReviewing(true);
    setError("");
    setSuccess("");
    try {
      await reviewCenterReassignmentRequest(reviewTarget.id, {
        action: reviewAction,
        reviewReason: reviewReason.trim() || undefined
      });
      setSuccess(`Request ${reviewAction === "APPROVED" ? "approved" : "rejected"} successfully.`);
      setReviewTarget(null);
      setReviewAction("");
      setReviewReason("");
      void loadRequests();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to review request.");
    } finally {
      setReviewing(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading reassignment requests..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Reassignment Requests</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Review student worksheet reassignment requests for your center.</div>
      </div>

      {error ? <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div> : null}
      {success ? <div className="card" style={{ color: "var(--color-text-success)" }}>{success}</div> : null}

      <div style={{ display: "flex", gap: 8 }}>
        {["PENDING", "APPROVED", "REJECTED", "CANCELLED", ""].map((s) => (
          <button
            key={s || "ALL"}
            className={filter === s ? "button" : "button secondary"}
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            onClick={() => setFilter(s)}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card"><div className="muted">No requests found.</div></div>
      ) : (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Worksheet</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>{req.student?.firstName || ""} {req.student?.lastName || ""}</td>
                    <td>{req.currentWorksheet?.title || req.currentWorksheetId}</td>
                    <td>{req.type}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.reason}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: req.status === "PENDING" ? "var(--color-bg-warning)" : req.status === "APPROVED" ? "var(--color-bg-success-light)" : req.status === "REJECTED" ? "var(--color-bg-danger-light)" : "var(--color-bg-muted)",
                        color: req.status === "PENDING" ? "var(--color-text-warning)" : req.status === "APPROVED" ? "var(--color-text-success)" : req.status === "REJECTED" ? "var(--color-text-danger)" : "var(--color-text-muted)"
                      }}>
                        {req.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {req.status === "PENDING" ? (
                        <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button
                            className="button"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => { setReviewTarget(req); setReviewAction("APPROVED"); setReviewReason(""); }}
                          >
                            Approve
                          </button>
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => { setReviewTarget(req); setReviewAction("REJECTED"); setReviewReason(""); }}
                          >
                            Reject
                          </button>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{req.reviewReason || "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {reviewTarget ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
          }}
          onClick={() => setReviewTarget(null)}
        >
          <div className="card" style={{ minWidth: 340, maxWidth: 460, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px" }}>
              {reviewAction === "APPROVED" ? "Approve" : "Reject"} Request
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
              Student: <strong>{reviewTarget.student?.firstName} {reviewTarget.student?.lastName}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
              Worksheet: <strong>{reviewTarget.currentWorksheet?.title || reviewTarget.currentWorksheetId}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
              Type: <strong>{reviewTarget.type}</strong> — Reason: {reviewTarget.reason}
            </p>

            {reviewAction === "REJECTED" ? (
              <label style={{ display: "block", marginBottom: 10 }}>
                Rejection Reason (required)
                <textarea
                  className="input"
                  rows={2}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Why are you rejecting this request?"
                />
              </label>
            ) : (
              <label style={{ display: "block", marginBottom: 10 }}>
                Note (optional)
                <textarea
                  className="input"
                  rows={2}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Optional note for approval"
                />
              </label>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setReviewTarget(null)}>
                Cancel
              </button>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={reviewing || (reviewAction === "REJECTED" && !reviewReason.trim())}
                onClick={handleReview}
              >
                {reviewing ? "Processing..." : reviewAction === "APPROVED" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { CenterReassignmentQueuePage };
