import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listCompetitions,
  createCompetition,
  forwardCompetitionRequest,
  rejectCompetitionRequest,
  exportCompetitionResultsCsv
} from "../../services/competitionsService";
import { listLevels } from "../../services/levelsService";

function SuperadminCompetitionPage() {
  const [rows, setRows] = useState([]);
  const [levels, setLevels] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("Abacus Competition");
  const [levelId, setLevelId] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [creating, setCreating] = useState(false);

  // leaderboard
  const [total, setTotal] = useState(0);

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listCompetitions(next);
      setRows(data?.data?.items || data?.data || []);
      setTotal(data?.data?.total ?? 0);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competitions.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
    void (async () => {
      try {
        const lv = await listLevels({ limit: 50, offset: 0 });
        setLevels(lv?.data?.items || lv?.data || []);
      } catch {
        setLevels([]);
      }
    })();
  }, []);

  const handleApprove = async (row) => {
    try {
      await forwardCompetitionRequest(row.id);
      toast.success("Competition approved.");
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to approve.");
    }
  };

  const handleReject = (row) => {
    setRejectTarget(row);
  };

  const executeReject = async (reason) => {
    const row = rejectTarget;
    const normalizedReason = String(reason || "").trim();
    if (!normalizedReason) {
      toast.error("Rejection reason is required.");
      return;
    }
    setRejectTarget(null);
    try {
      await rejectCompetitionRequest(row.id, normalizedReason);
      toast.success("Competition rejected.");
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to reject.");
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title || !levelId || !startsAt || !endsAt) {
      toast.error("Title, level, start date and end date are required.");
      return;
    }
    setCreating(true);
    try {
      await createCompetition({
        title,
        description: "Created by superadmin",
        startsAt,
        endsAt,
        levelId
      });
      toast.success("Competition created.");
      setShowCreate(false);
      setTitle("Abacus Competition");
      setLevelId("");
      setStartsAt("");
      setEndsAt("");
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to create.");
    } finally {
      setCreating(false);
    }
  };

  const handleExportCsv = async (row) => {
    try {
      const blob = await exportCompetitionResultsCsv(row.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competition-${row.id}-results.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading competitions..." />;
  }

  const columns = [
    { key: "title", header: "Competition", render: (r) => r?.title || "" },
    { key: "level", header: "Level", render: (r) => r?.level?.name || "" },
    { key: "center", header: "Origin", render: (r) => r?.hierarchyNode?.name || "—" },
    { key: "stage", header: "Stage", render: (r) => <StatusBadge status={r?.workflowStage || ""} /> },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r?.status || ""} /> },
    { key: "resultStatus", header: "Result", render: (r) => <StatusBadge status={r?.resultStatus || "DRAFT"} /> },
    { key: "enrollments", header: "Enrolled", render: (r) => r?.enrollments?.length ?? 0 },
    {
      key: "actions",
      header: "Actions",
      render: (r) => {
        const isApprovalStage = r?.workflowStage === "SUPERADMIN_APPROVAL";
        const isApproved = r?.status === "SCHEDULED" || r?.workflowStage === "APPROVED";
        return (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {isApprovalStage ? (
              <>
                <button className="button" style={{ width: "auto", fontSize: 12 }} onClick={() => handleApprove(r)}>
                  Approve
                </button>
                <button className="button secondary" style={{ width: "auto", fontSize: 12 }} onClick={() => handleReject(r)}>
                  Reject
                </button>
              </>
            ) : null}
            {isApproved ? (
              <>
                <Link className="button secondary" style={{ width: "auto", fontSize: 12 }} to={`/superadmin/competition/${r.id}/results`}>
                  Results
                </Link>
                <button className="button secondary" style={{ width: "auto", fontSize: 12 }} onClick={() => handleExportCsv(r)}>
                  Export CSV
                </button>
              </>
            ) : null}
            {isApprovalStage ? (
              <Link className="button secondary" style={{ width: "auto", fontSize: 12 }} to={`/superadmin/competition/${r.id}/pending`}>
                Pending
              </Link>
            ) : null}
          </div>
        );
      }
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Competitions</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Manage competitions across all partners</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => load({ limit, offset })}>
            Refresh
          </button>
          <button className="button" style={{ width: "auto" }} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "+ New Competition"}
          </button>
        </div>
      </div>

      {showCreate ? (
        <form className="card" onSubmit={handleCreate} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ display: "grid", gap: 4 }}>
            Title
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 240 }} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Level
            <select className="input" value={levelId} onChange={(e) => setLevelId(e.target.value)} style={{ width: 200 }}>
              <option value="">Select level</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  L{l.rank} – {l.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Starts at
            <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Ends at
            <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <button className="button" style={{ width: "auto" }} disabled={creating} type="submit">
            {creating ? "Creating..." : "Create"}
          </button>
        </form>
      ) : null}

      {error ? (
        <div className="card">
          <p style={{ margin: 0, color: "var(--color-text-danger)" }}>{error}</p>
        </div>
      ) : null}

      <DataTable columns={columns} rows={rows} keyField="id" />
      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset });
        }}
      />

      {/* Reject dialog */}
      <InputDialog
        open={!!rejectTarget}
        title="Reject Competition"
        message={`Reject "${rejectTarget?.title || ""}"?`}
        inputLabel="Reason"
        inputPlaceholder="Enter reason..."
        inputType="text"
        required
        confirmLabel="Reject"
        onCancel={() => setRejectTarget(null)}
        onConfirm={(val) => void executeReject(val)}
      />
    </div>
  );
}

export { SuperadminCompetitionPage };
