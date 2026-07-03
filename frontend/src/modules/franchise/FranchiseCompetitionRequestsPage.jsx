import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { getApiErrorCode, getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  forwardFranchiseCompetitionRequest,
  getMyFranchise,
  listFranchiseCompetitionRequests,
  rejectFranchiseCompetitionRequest
} from "../../services/franchiseService";

const STAGE_OPTIONS = [
  { value: "ALL", label: "All Stages" },
  { value: "CENTER_SUBMITTED", label: "Center Submitted" },
  { value: "FRANCHISE_REVIEW", label: "Franchise Review" },
  { value: "RETURNED", label: "Returned" },
  { value: "FRANCHISE_SUBMITTED", label: "Submitted to BP" }
];

function normalizeCompetitionRequestRows(payload) {
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

function isFranchiseActionableStage(stage) {
  return String(stage || "").toUpperCase() === "FRANCHISE_REVIEW";
}

function FranchiseCompetitionRequestsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [stage, setStage] = useState("ALL");

  const franchiseLabel = useMemo(() => {
    return franchise?.profile?.displayName || franchise?.profile?.name || franchise?.profile?.code || "Franchise";
  }, [franchise]);

  const load = async (next = { limit, offset, stage }) => {
    setLoading(true);
    setError("");
    try {
      const [franchiseData, requestsData] = await Promise.all([
        getMyFranchise(),
        listFranchiseCompetitionRequests(next)
      ]);
      setFranchise(franchiseData?.data || franchiseData || null);
      const nextRows = normalizeCompetitionRequestRows(requestsData);
      setRows(nextRows);
      setTotal(requestsData?.data?.total ?? requestsData?.total ?? nextRows.length);
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, stage });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const refresh = () => {
    void load({ limit, offset, stage });
  };

  const handleView = (row) => {
    navigate(`/franchise/competitions/${row.id}`);
  };

  const handleApprove = async (row) => {
    if (!isFranchiseActionableStage(row?.workflowStage)) {
      toast.error("This request is no longer in Franchise Review stage. Refresh to get latest status.");
      return;
    }
    try {
      await forwardFranchiseCompetitionRequest(row.id);
      await load({ limit, offset, stage });
    } catch (err) {
      if (getApiErrorCode(err) === "WORKFLOW_STAGE_CONFLICT") {
        await load({ limit, offset, stage });
      }
      toast.error(getFriendlyErrorMessage(err) || "Failed to approve request.");
    }
  };

  const handleReturn = (row) => {
    if (!isFranchiseActionableStage(row?.workflowStage)) {
      toast.error("This request is no longer in Franchise Review stage. Refresh to get latest status.");
      return;
    }
    setRejectTarget(row);
  };

  const executeReturn = async (reason) => {
    const row = rejectTarget;
    setRejectTarget(null);
    if (!row) return;
    try {
      await rejectFranchiseCompetitionRequest(row.id, reason || "");
      await load({ limit, offset, stage });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to return request.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading requests..." />;
  }

  const columns = [
    {
      key: "competition",
      header: "Competition",
      render: (r) => r?.title || ""
    },
    {
      key: "code",
      header: "Code",
      render: (r) => r?.code || "—"
    },
    {
      key: "level",
      header: "Level",
      render: (r) => r?.level?.name || ""
    },
    {
      key: "center",
      header: "Center",
      render: (r) => r?.center?.name || r?.hierarchyNode?.name || "—"
    },
    {
      key: "students",
      header: "Students",
      render: (r) => r?.studentCount ?? 0
    },
    {
      key: "temporaryStudents",
      header: "Temporary Students",
      render: (r) => r?.temporaryStudentCount ?? 0
    },
    {
      key: "stage",
      header: "Current Stage",
      render: (r) => <StatusBadge status={r?.workflowStage || ""} />
    },
    {
      key: "submittedAt",
      header: "Submitted At",
      render: (r) => (r?.submittedAt ? new Date(r.submittedAt).toLocaleString() : "—")
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => {
        const canReview = isFranchiseActionableStage(r?.workflowStage);
        return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleView(r)}>
            View
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleApprove(r)} disabled={!canReview} title={!canReview ? "Available only in Franchise Review stage" : ""}>
            Approve
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => handleReturn(r)} disabled={!canReview} title={!canReview ? "Available only in Franchise Review stage" : ""}>
            Return
          </button>
        </div>
      );
      }
    }
  ];

  const emptyReason = stage === "ALL"
    ? `No competition requests are assigned to ${franchiseLabel} right now.`
    : `No ${STAGE_OPTIONS.find((option) => option.value === stage)?.label?.toLowerCase() || "matching"} requests are assigned to ${franchiseLabel}.`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0 }}>Competition Requests</h2>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {franchiseLabel} review queue
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select
              className="input"
              value={stage}
              onChange={(event) => {
                const nextStage = event.target.value;
                setStage(nextStage);
                setOffset(0);
              }}
              style={{ minWidth: 180 }}
            >
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button className="button secondary" type="button" onClick={refresh} style={{ width: "auto" }}>
              Refresh
            </button>
          </div>
        </div>
        {error ? <div style={{ color: "var(--color-text-danger)", marginTop: 8 }}>{error}</div> : null}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {rows.length ? (
          <DataTable columns={columns} rows={rows} keyField="id" />
        ) : (
          <div style={{ padding: 24, color: "var(--color-text-muted)" }}>{emptyReason}</div>
        )}
      </div>

      {rows.length ? (
        <PaginationBar
          limit={limit}
          offset={offset}
          count={rows.length}
          total={total}
          onChange={(next) => {
            setLimit(next.limit);
            setOffset(next.offset);
            void load({ limit: next.limit, offset: next.offset, stage });
          }}
        />
      ) : null}

      <InputDialog
        open={!!rejectTarget}
        title="Return Competition Request"
        message={`Return request for "${rejectTarget?.title || ""}"?`}
        inputLabel="Reason (optional)"
        inputPlaceholder="Enter reason..."
        inputType="text"
        confirmLabel="Return"
        onCancel={() => setRejectTarget(null)}
        onConfirm={(val) => void executeReturn(val)}
      />
    </div>
  );
}

export { FranchiseCompetitionRequestsPage };
