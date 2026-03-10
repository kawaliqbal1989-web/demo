import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  forwardFranchiseCompetitionRequest,
  listFranchiseCompetitionRequests,
  rejectFranchiseCompetitionRequest
} from "../../services/franchiseService";

function FranchiseCompetitionRequestsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listFranchiseCompetitionRequests(next);
      setRows(Array.isArray(data.data) ? data.data : []);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset });
  }, []);

  const handleForward = async (row) => {
    try {
      await forwardFranchiseCompetitionRequest(row.id);
      await load({ limit, offset });
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to forward request.");
    }
  };

  const handleReject = (row) => {
    setRejectTarget(row);
  };

  const executeReject = async (reason) => {
    const row = rejectTarget;
    setRejectTarget(null);
    try {
      await rejectFranchiseCompetitionRequest(row.id, reason || "");
      await load({ limit, offset });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reject request.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading requests..." />;
  }

  const columns = [
    {
      key: "title",
      header: "Competition",
      render: (r) => r?.title || ""
    },
    {
      key: "level",
      header: "Level",
      render: (r) => r?.level?.name || ""
    },
    {
      key: "center",
      header: "Center",
      render: (r) => r?.hierarchyNode?.name || ""
    },
    {
      key: "stage",
      header: "Stage",
      render: (r) => <StatusBadge status={r?.workflowStage || ""} />
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleForward(r)}>
            Forward
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleReject(r)}>
            Reject
          </button>
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <h2 style={{ margin: 0 }}>Competition Requests</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Requests awaiting franchise review</div>
        {error ? <div style={{ color: "var(--color-text-danger)", marginTop: 8 }}>{error}</div> : null}
      </div>

      <DataTable columns={columns} rows={rows} keyField="id" />
      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset });
        }}
      />

      <InputDialog
        open={!!rejectTarget}
        title="Reject Competition Request"
        message={`Reject request for "${rejectTarget?.title || ""}"?`}
        inputLabel="Reason (optional)"
        inputPlaceholder="Enter reason..."
        inputType="text"
        confirmLabel="Reject"
        onCancel={() => setRejectTarget(null)}
        onConfirm={(val) => void executeReject(val)}
      />
    </div>
  );
}

export { FranchiseCompetitionRequestsPage };
