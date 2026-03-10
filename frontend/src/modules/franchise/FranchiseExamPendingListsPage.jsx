import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  exportEnrollmentListCsv,
  forwardPendingEnrollmentList,
  listPendingEnrollmentLists,
  rejectPendingEnrollmentList
} from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function FranchiseExamPendingListsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [forwardListId, setForwardListId] = useState(null);
  const [rejectListId, setRejectListId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPendingEnrollmentLists(examCycleId);
      setRows(data?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load pending lists.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const canAct = useMemo(() => {
    return (listId) => actingId === null || actingId === listId;
  }, [actingId]);

  const doForward = (listId) => {
    if (!listId || !canAct(listId)) return;
    setForwardListId(listId);
  };

  const executeForward = async () => {
    const listId = forwardListId;
    setForwardListId(null);
    setActingId(listId);
    setError("");
    try {
      await forwardPendingEnrollmentList(examCycleId, listId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to forward list.");
    } finally {
      setActingId(null);
    }
  };

  const doReject = (listId) => {
    if (!listId || !canAct(listId)) return;
    setRejectListId(listId);
  };

  const executeReject = async (remark) => {
    const listId = rejectListId;
    setRejectListId(null);
    setActingId(listId);
    setError("");
    try {
      await rejectPendingEnrollmentList(examCycleId, listId, { remark: remark || "" });
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reject list.");
    } finally {
      setActingId(null);
    }
  };

  const doExport = async (listId) => {
    if (!listId) return;
    try {
      const resp = await exportEnrollmentListCsv(examCycleId, listId);
      downloadBlob(resp.data, `exam_enrollment_${examCycleId}_${listId}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading) {
    return <LoadingState label="Loading pending lists..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Pending Exam Enrollment Lists</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Combined lists submitted by Centers</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)" }}>Count: {rows.length}</div>
        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          {
            key: "center",
            header: "Center",
            render: (r) => r?.centerNode ? `${r.centerNode.name} (${r.centerNode.code || r.centerNode.id})` : ""
          },
          { key: "entries", header: "Entries", render: (r) => String(r?.entriesCount ?? "") },
          { key: "status", header: "Status", render: (r) => r?.status || "" },
          { key: "forwardedAt", header: "Submitted At", render: (r) => formatDateTime(r?.forwardedAt || r?.submittedAt) },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="button secondary" type="button" onClick={() => void doExport(r.id)} style={{ width: "auto" }}>
                  Export CSV
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={() => void doForward(r.id)}
                  disabled={actingId === r.id}
                  style={{ width: "auto" }}
                >
                  {actingId === r.id ? "Working..." : "Forward"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => void doReject(r.id)}
                  disabled={actingId === r.id}
                  style={{ width: "auto" }}
                >
                  Reject
                </button>
              </div>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <ConfirmDialog
        open={!!forwardListId}
        title="Forward List"
        message="Forward this combined list to Business Partner?"
        confirmLabel="Forward"
        onCancel={() => setForwardListId(null)}
        onConfirm={() => void executeForward()}
      />

      <InputDialog
        open={!!rejectListId}
        title="Reject List"
        message="Reject this combined list back to Center?"
        inputLabel="Remark (optional)"
        inputPlaceholder="Enter remark..."
        inputType="text"
        confirmLabel="Reject"
        onCancel={() => setRejectListId(null)}
        onConfirm={(val) => void executeReject(val)}
      />
    </section>
  );
}

export { FranchiseExamPendingListsPage };
