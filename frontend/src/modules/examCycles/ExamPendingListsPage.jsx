import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  exportEnrollmentListCsv,
  forwardPendingEnrollmentList,
  listPendingEnrollmentLists,
  rejectPendingEnrollmentList
} from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function ExamPendingListsPage({
  title = "Pending Exam Enrollment Lists",
  subtitle = "Review and forward combined enrollment lists.",
  forwardMessage = "Forward this combined list to the next approval level?",
  rejectMessage = "Reject this combined list back for correction?"
}) {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [forwardListId, setForwardListId] = useState(null);
  const [rejectListId, setRejectListId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

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

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.lists += 1;
        acc.entries += Number(row?.entriesCount || 0);
        acc.statuses[String(row?.status || "UNKNOWN").toUpperCase()] = (acc.statuses[String(row?.status || "UNKNOWN").toUpperCase()] || 0) + 1;
        return acc;
      },
      { lists: 0, entries: 0, statuses: {} }
    );
  }, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      const status = String(row?.status || "").toUpperCase();
      if (statusFilter !== "ALL" && status !== statusFilter) return false;
      if (!q) return true;
      return [
        row?.id,
        row?.centerNode?.name,
        row?.centerNode?.code,
        status
      ].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [rows, search, statusFilter]);

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

  const executeReject = async (listId, remark) => {
    setRejectListId(null);
    setActingId(listId);
    setError("");
    try {
      await rejectPendingEnrollmentList(examCycleId, listId, { remark });
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>{subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
            Refresh
          </button>
          <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
            Back
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
        {[
          ["Pending Lists", summary.lists],
          ["Entries", summary.entries],
          ["Submitted", summary.statuses.SUBMITTED_TO_BUSINESS_PARTNER || summary.statuses.SUBMITTED_TO_FRANCHISE || 0],
          ["Visible Rows", visibleRows.length]
        ].map(([label, value]) => (
          <div key={label} className="card" style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", fontWeight: 800 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{Number(value || 0).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Search
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Center, code, status" />
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Status
            <select className="input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">All statuses</option>
              <option value="SUBMITTED_TO_FRANCHISE">Submitted to Franchise</option>
              <option value="SUBMITTED_TO_BUSINESS_PARTNER">Submitted to BP</option>
              <option value="SUBMITTED_TO_SUPERADMIN">Submitted to Superadmin</option>
            </select>
          </label>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setSearch("");
              setStatusFilter("ALL");
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          {
            key: "center",
            header: "Center",
            render: (row) => row?.centerNode ? `${row.centerNode.name} (${row.centerNode.code || row.centerNode.id})` : "-"
          },
          { key: "entries", header: "Entries", render: (row) => String(row?.entriesCount ?? 0) },
          { key: "status", header: "Status", render: (row) => <StatusBadge status={row?.status || "PENDING"} /> },
          { key: "forwardedAt", header: "Submitted", render: (row) => formatDateTime(row?.forwardedAt || row?.submittedAt) },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" onClick={() => void doExport(row.id)} style={{ width: "auto" }}>
                  Export CSV
                </button>
                <button className="button" type="button" onClick={() => setForwardListId(row.id)} disabled={actingId === row.id} style={{ width: "auto" }}>
                  {actingId === row.id ? "Working..." : "Forward"}
                </button>
                <button className="button secondary" type="button" onClick={() => setRejectListId(row.id)} disabled={actingId === row.id} style={{ width: "auto" }}>
                  Reject
                </button>
              </div>
            )
          }
        ]}
        rows={visibleRows}
        keyField="id"
        emptyMessage={error ? "Unable to load pending lists." : "No pending lists match the selected filters."}
      />

      <ConfirmDialog
        open={!!forwardListId}
        title="Forward Enrollment List"
        message={forwardMessage}
        confirmLabel="Forward"
        onCancel={() => setForwardListId(null)}
        onConfirm={() => void executeForward()}
      />

      <InputDialog
        open={!!rejectListId}
        title="Reject Enrollment List"
        message={rejectMessage}
        inputLabel="Remark"
        inputPlaceholder="Reason for rejection"
        confirmLabel="Reject"
        onCancel={() => setRejectListId(null)}
        onConfirm={(value) => void executeReject(rejectListId, value)}
      />
    </section>
  );
}

export { ExamPendingListsPage };
