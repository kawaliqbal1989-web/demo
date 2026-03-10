import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listBatches } from "../../services/batchesService";
import { createAttendanceSession, listAttendanceCorrections, listAttendanceSessions, reviewAttendanceCorrection } from "../../services/attendanceService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CenterAttendanceSessionsPage() {
  const [batches, setBatches] = useState([]);
  const [batchId, setBatchId] = useState("");
  const [date, setDate] = useState(todayISO());

  const [rows, setRows] = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const bootstrap = async () => {
    setLoading(true);
    setError("");
    try {
      const [b, c] = await Promise.all([
        listBatches({ limit: 200, offset: 0 }),
        listAttendanceCorrections({ limit: 50, offset: 0, status: "PENDING" })
      ]);
      setBatches(b.data?.items || []);
      setCorrections(c.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load batches.");
    } finally {
      setLoading(false);
    }
  };

  const refreshCorrections = async () => {
    try {
      const c = await listAttendanceCorrections({ limit: 50, offset: 0, status: "PENDING" });
      setCorrections(c.data?.items || []);
    } catch {
      // ignore
    }
  };

  const loadSessions = async (nextBatchId = batchId) => {
    if (!nextBatchId) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await listAttendanceSessions({ limit: 100, offset: 0, batchId: nextBatchId });
      setRows(data.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load sessions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void bootstrap();
  }, []);

  const onSelectBatch = async (id) => {
    setBatchId(id);
    await loadSessions(id);
  };

  const onCreate = async (e) => {
    e.preventDefault();
    if (!batchId || !date) {
      setError("batchId and date are required");
      return;
    }

    setCreating(true);
    setError("");
    try {
      await createAttendanceSession({ batchId, date });
      await loadSessions(batchId);
      await refreshCorrections();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create session.");
    } finally {
      setCreating(false);
    }
  };

  const onReviewCorrection = async (requestId, action) => {
    setReviewing(true);
    setError("");
    try {
      await reviewAttendanceCorrection(requestId, action);
      await refreshCorrections();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to review correction.");
    } finally {
      setReviewing(false);
    }
  };

  if (loading && !batches.length) {
    return <LoadingState label="Loading attendance..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Attendance Sessions</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create and manage roll-call sessions by batch and date</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          Batch
          <select className="select" value={batchId} onChange={(e) => void onSelectBatch(e.target.value)}>
            <option value="">Select</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={onCreate} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Date</span>
            <input className="input" value={date} onChange={(e) => setDate(e.target.value)} placeholder="YYYY-MM-DD" />
          </label>

          <button className="button" style={{ width: "auto" }} disabled={!batchId || creating}>
            {creating ? "Creating..." : "Create Session"}
          </button>

          <button
            type="button"
            className="button secondary"
            style={{ width: "auto" }}
            disabled={!batchId}
            onClick={() => void loadSessions(batchId)}
          >
            Refresh
          </button>
        </form>
      </div>

      {!batchId ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>Select a batch to view sessions.</div>
      ) : (
        <DataTable
          columns={[
            { key: "date", header: "Date", render: (r) => String(r?.date || "").slice(0, 10) },
            { key: "status", header: "Status" },
            { key: "version", header: "Version" },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <Link className="button secondary" style={{ width: "auto" }} to={`/attendance/sessions/${r.id}`}>
                  Open
                </Link>
              )
            }
          ]}
          rows={rows}
          keyField="id"
        />
      )}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Pending Corrections</h3>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Approve or reject attendance correction requests</div>
          </div>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => void refreshCorrections()} disabled={reviewing}>
            Refresh
          </button>
        </div>

        <DataTable
          columns={[
            { key: "date", header: "Date", render: (r) => String(r?.session?.date || "").slice(0, 10) },
            { key: "batch", header: "Batch", render: (r) => r?.session?.batch?.name || "" },
            { key: "requestedBy", header: "Requested By", render: (r) => r?.requestedBy?.username || r?.requestedBy?.email || "" },
            { key: "reason", header: "Reason", render: (r) => r?.reason || "" },
            {
              key: "actions",
              header: "Actions",
              render: (r) => (
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="button secondary" style={{ width: "auto" }} disabled={reviewing} onClick={() => void onReviewCorrection(r.id, "APPROVE")}>
                    Approve
                  </button>
                  <button className="button secondary" style={{ width: "auto" }} disabled={reviewing} onClick={() => void onReviewCorrection(r.id, "REJECT")}>
                    Reject
                  </button>
                </div>
              )
            }
          ]}
          rows={corrections}
          keyField="id"
        />
      </div>
    </section>
  );
}

export { CenterAttendanceSessionsPage };
