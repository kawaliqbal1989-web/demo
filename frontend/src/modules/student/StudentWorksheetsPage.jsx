import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { MetricCard } from "../../components/MetricCard";
import { getApiErrorCode, getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listStudentWorksheets,
  createStudentReassignmentRequest,
  listStudentReassignmentRequests,
  cancelStudentReassignmentRequest
} from "../../services/studentPortalService";

async function fetchAllStudentWorksheets({ pageSize = 100 } = {}) {
  const all = [];
  let page = 1;
  let total = 0;
  const maxPages = 10;

  while (page <= maxPages) {
    // eslint-disable-next-line no-await-in-loop
    const res = await listStudentWorksheets({ page, pageSize });
    const payload = res.data?.data;
    const items = Array.isArray(payload?.items) ? payload.items : [];
    total = Number(payload?.total || 0);
    all.push(...items);

    if (all.length >= total) {
      break;
    }
    if (!items.length) {
      break;
    }
    page += 1;
  }

  return {
    total,
    items: all
  };
}

function StudentWorksheetsPage() {
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignReason, setReassignReason] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignRequests, setReassignRequests] = useState([]);
  const [reassignSuccess, setReassignSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      fetchAllStudentWorksheets({ pageSize: 100 }),
      listStudentReassignmentRequests().then((r) => r?.data?.data?.items || r?.data?.data || r?.data || []).catch(() => [])
    ])
      .then(([payload, requests]) => {
        if (cancelled) return;
        setData({
          total: payload?.total || 0,
          items: Array.isArray(payload?.items) ? payload.items : []
        });
        setReassignRequests(Array.isArray(requests) ? requests : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load worksheets.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const pending = [];
    const inProgress = [];
    const completed = [];
    const reassigned = [];

    for (const item of data.items) {
      if (item.reassignmentCount > 0 && item?.status === "NOT_STARTED") {
        reassigned.push(item);
      } else if (item?.status === "IN_PROGRESS") {
        inProgress.push(item);
      } else if (item?.status === "SUBMITTED") {
        completed.push(item);
      } else {
        pending.push(item);
      }
    }

    return {
      pending,
      inProgress,
      completed,
      reassigned
    };
  }, [data.items]);

  const attemptedCount = grouped.inProgress.length + grouped.completed.length;

  const metrics = useMemo(() => {
    return [
      { label: "Total", value: data.total || 0 },
      { label: "Attempted", value: attemptedCount },
      { label: "In Progress", value: grouped.inProgress.length },
      { label: "Completed", value: grouped.completed.length },
      { label: "Reassigned", value: grouped.reassigned.length }
    ];
  }, [attemptedCount, data.total, grouped.completed.length, grouped.inProgress.length, grouped.reassigned.length]);

  const pendingRequestByWorksheetId = useMemo(() => {
    const map = new Map();
    for (const req of reassignRequests) {
      if (req?.status !== "PENDING" || !req?.currentWorksheetId) {
        continue;
      }
      map.set(req.currentWorksheetId, req);
    }
    return map;
  }, [reassignRequests]);

  if (loading) {
    return <LoadingState label="Loading worksheets..." />;
  }

  const renderWorksheetTable = (items, actionLabel, showReassign = false) => {
    return (
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Questions</th>
              <th>Duration</th>
              <th>Reassignments</th>
              <th style={{ textAlign: "right" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.worksheetId}>
                <td>{item.title}</td>
                <td>{item.totalQuestions}</td>
                <td>{item.durationSeconds ? `${Math.round(item.durationSeconds / 60)}m` : "—"}</td>
                <td>{item.reassignmentCount ?? 0}</td>
                <td style={{ textAlign: "right" }}>
                  <Link className="button" style={{ width: "auto" }} to={`/student/worksheets/${item.worksheetId}`}>
                    {actionLabel}
                  </Link>
                  {showReassign ? (
                    <button
                      className="button secondary"
                      style={{ width: "auto", marginLeft: 6, fontSize: 12 }}
                      disabled={pendingRequestByWorksheetId.has(item.worksheetId)}
                      title={pendingRequestByWorksheetId.has(item.worksheetId) ? "A reassignment request is already pending for this worksheet." : ""}
                      onClick={() => {
                        setReassignTarget(item);
                        setReassignReason("");
                        setReassignSuccess("");
                      }}
                    >
                      {pendingRequestByWorksheetId.has(item.worksheetId) ? "Request Pending" : "Request Reassign"}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>My Worksheets</h2>
          <div className="dash-card__subtitle" style={{ marginTop: 6 }}>
            Your tasks grouped by status.
          </div>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="dash-kpi-grid">
        {metrics.map((m) => (
          <MetricCard key={m.label} label={m.label} value={m.value} />
        ))}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Reassigned by Teacher</div>
        {grouped.reassigned.length ? renderWorksheetTable(grouped.reassigned, "Retry") : <div className="muted">No reassigned worksheets.</div>}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Pending</div>
        {grouped.pending.length ? renderWorksheetTable(grouped.pending, "Start") : <div className="muted">No pending worksheets.</div>}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">In Progress</div>
        {grouped.inProgress.length ? (
          renderWorksheetTable(grouped.inProgress, "Resume")
        ) : (
          <div className="muted">No worksheets in progress.</div>
        )}
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Completed</div>
        {grouped.completed.length ? (
          renderWorksheetTable(grouped.completed, "View", true)
        ) : (
          <div className="muted">No completed worksheets yet.</div>
        )}
      </div>

      {reassignRequests.length > 0 ? (
        <div className="card dash-card">
          <div className="dash-card__title">My Reassignment Requests</div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Worksheet</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Result</th>
                  <th>Reason</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reassignRequests.map((req) => (
                  <tr key={req.id}>
                    <td>{req.currentWorksheet?.title || req.currentWorksheetId}</td>
                    <td>{req.type}</td>
                    <td>{req.status}</td>
                    <td style={{ fontSize: 12 }}>
                      {req.archivedResultSnapshot?.submittedAt ? (
                        <>
                          {req.archivedResultSnapshot.score == null ? "—" : `${Number(req.archivedResultSnapshot.score).toFixed(2)}%`}
                          {req.archivedResultSnapshot.correctCount != null && req.archivedResultSnapshot.totalQuestions != null ? (
                            <>
                              {" "}({req.archivedResultSnapshot.correctCount}/{req.archivedResultSnapshot.totalQuestions})
                            </>
                          ) : null}
                        </>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{req.reason}</td>
                    <td style={{ textAlign: "right" }}>
                      {req.status === "PENDING" ? (
                        <button
                          className="button secondary"
                          style={{ width: "auto", fontSize: 12 }}
                          onClick={async () => {
                            try {
                              await cancelStudentReassignmentRequest(req.id);
                              setReassignRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: "CANCELLED" } : r)));
                            } catch {
                              setError("Failed to cancel request.");
                            }
                          }}
                        >
                          Cancel
                        </button>
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
      ) : null}

      {reassignSuccess ? (
        <div className="card" style={{ color: "var(--color-text-success)" }}>{reassignSuccess}</div>
      ) : null}

      {reassignTarget && pendingRequestByWorksheetId.has(reassignTarget.worksheetId) ? (
        <div className="card" style={{ color: "var(--color-text-warning)" }}>
          A reassignment request is already pending for this worksheet. You can cancel it below in My Reassignment Requests.
        </div>
      ) : null}

      {reassignTarget ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
          }}
          onClick={() => setReassignTarget(null)}
        >
          <div
            className="card"
            style={{ minWidth: 340, maxWidth: 460, padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>Request Reassignment</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
              Worksheet: <strong>{reassignTarget.title}</strong>
            </p>
            <label style={{ display: "block", marginBottom: 10 }}>
              Reason (required)
              <textarea
                className="input"
                rows={3}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Why do you need to redo this worksheet?"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setReassignTarget(null)}>
                Cancel
              </button>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={!reassignReason.trim() || reassigning || pendingRequestByWorksheetId.has(reassignTarget.worksheetId)}
                onClick={async () => {
                  setReassigning(true);
                  setError("");
                  try {
                    await createStudentReassignmentRequest({
                      currentWorksheetId: reassignTarget.worksheetId,
                      type: "RETRY",
                      reason: reassignReason.trim()
                    });
                    setReassignTarget(null);
                    setReassignSuccess("Reassignment request submitted. Your teacher will review it.");
                    const resp = await listStudentReassignmentRequests();
                    const items = resp?.data?.data?.items || resp?.data?.data || resp?.data || [];
                    setReassignRequests(Array.isArray(items) ? items : []);
                  } catch (err) {
                    const code = getApiErrorCode(err);
                    if (code === "DUPLICATE_PENDING") {
                      const resp = await listStudentReassignmentRequests().catch(() => null);
                      const items = resp?.data?.data?.items || resp?.data?.data || resp?.data || [];
                      setReassignRequests(Array.isArray(items) ? items : []);
                    }
                    setError(getFriendlyErrorMessage(err) || "Failed to submit request.");
                  } finally {
                    setReassigning(false);
                  }
                }}
              >
                {reassigning ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { StudentWorksheetsPage };
