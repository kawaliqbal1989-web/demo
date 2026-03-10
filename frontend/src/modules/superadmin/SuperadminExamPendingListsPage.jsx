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
  approveEnrollmentListAsSuperadmin,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  listPendingEnrollmentLists,
  rejectPendingEnrollmentList
} from "../../services/examCyclesService";
import { listWorksheets } from "../../services/worksheetsService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function SuperadminExamPendingListsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [levelBreakdownByListId, setLevelBreakdownByListId] = useState({});
  const [worksheetsByLevelId, setWorksheetsByLevelId] = useState({});
  const [selectionByListId, setSelectionByListId] = useState({});

  const [approveListId, setApproveListId] = useState(null);
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

  const openApprovalForm = async (listId) => {
    if (!listId || !canAct(listId)) return;
    if (editingId === listId) {
      setEditingId(null);
      return;
    }

    setEditingId(listId);
    setError("");

    if (!levelBreakdownByListId[listId]) {
      try {
        const resp = await getEnrollmentListLevelBreakdown(examCycleId, listId);
        const breakdown = resp?.data || [];
        setLevelBreakdownByListId((prev) => ({ ...prev, [listId]: breakdown }));

        // Ensure we have worksheet choices cached for each level.
        for (const item of breakdown) {
          const levelId = item?.levelId;
          if (!levelId || worksheetsByLevelId[levelId]) {
            continue;
          }
          const wsResp = await listWorksheets({ levelId, limit: 200, offset: 0, published: true });
          const ws = Array.isArray(wsResp?.data) ? wsResp.data : [];
          const eligible = ws
            .filter((w) => !w?.examCycleId)
            .filter((w) => (w?.questionCount ?? 0) > 0);

          setWorksheetsByLevelId((prev) => ({ ...prev, [levelId]: eligible }));
        }
      } catch (err) {
        setError(getFriendlyErrorMessage(err) || "Failed to load worksheet options.");
      }
    }
  };

  const setLevelSelection = (listId, levelId, worksheetId) => {
    setSelectionByListId((prev) => ({
      ...prev,
      [listId]: {
        ...(prev[listId] || {}),
        [levelId]: worksheetId
      }
    }));
  };

  const doConfirmApprove = async (listId) => {
    if (!listId || !canAct(listId)) return;
    const breakdown = levelBreakdownByListId[listId] || [];
    const sel = selectionByListId[listId] || {};

    const selections = breakdown
      .map((b) => ({
        levelId: b.levelId,
        worksheetId: sel[b.levelId] || ""
      }))
      .filter((x) => x.levelId);

    for (const s of selections) {
      if (!s.worksheetId) {
        setError("Select an exam worksheet for every level before approving.");
        return;
      }
    }

    setApproveListId(listId);
  };

  const executeApprove = async (listId) => {
    const breakdown = levelBreakdownByListId[listId] || [];
    const sel = selectionByListId[listId] || {};
    const selections = breakdown
      .map((b) => ({ levelId: b.levelId, worksheetId: sel[b.levelId] || "" }))
      .filter((x) => x.levelId);

    setApproveListId(null);
    setActingId(listId);
    setError("");
    try {
      await approveEnrollmentListAsSuperadmin(examCycleId, listId, { selections });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to approve list.");
    } finally {
      setActingId(null);
    }
  };

  const doReject = async (listId) => {
    if (!listId || !canAct(listId)) return;
    setRejectListId(listId);
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Enrollment Approvals</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Combined lists forwarded by Business Partners</div>
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
          { key: "forwardedAt", header: "Forwarded At", render: (r) => formatDateTime(r?.forwardedAt || r?.submittedAt) },
          {
            key: "actions",
            header: "Actions",
            wrap: true,
            render: (r) => (
              <div style={{ display: "grid", gap: 10, minWidth: 420 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" onClick={() => void doExport(r.id)} style={{ width: "auto" }}>
                    Export CSV
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void openApprovalForm(r.id)}
                    disabled={actingId === r.id}
                    style={{ width: "auto" }}
                  >
                    {editingId === r.id ? "Close" : "Approve"}
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

                {editingId === r.id ? (
                  <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Select one published exam worksheet per level in this request.
                    </div>

                    {(levelBreakdownByListId[r.id] || []).map((b) => {
                      const levelId = b.levelId;
                      const wsOptions = worksheetsByLevelId[levelId] || [];
                      const selected = (selectionByListId[r.id] || {})[levelId] || "";

                      return (
                        <div key={levelId} style={{ display: "grid", gap: 6 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <strong>
                              {b.levelName || levelId} (Students: {b.studentCount})
                            </strong>
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank: {String(b.levelRank ?? "")}</span>
                          </div>
                          <select
                            value={selected}
                            onChange={(e) => setLevelSelection(r.id, levelId, e.target.value)}
                            style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                          >
                            <option value="">-- Select worksheet --</option>
                            {wsOptions.map((w) => (
                              <option key={w.id} value={w.id}>
                                {w.title} (Q: {w.questionCount})
                              </option>
                            ))}
                          </select>
                          {!wsOptions.length ? (
                            <p className="error" style={{ margin: 0 }}>
                              No published worksheets found for this level.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void doConfirmApprove(r.id)}
                        disabled={actingId === r.id}
                        style={{ width: "auto" }}
                      >
                        {actingId === r.id ? "Working..." : "Confirm Approve"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <ConfirmDialog
        open={!!approveListId}
        title="Approve Enrollment List"
        message="Approve this combined list and assign the selected exam worksheets to students?"
        confirmLabel="Approve"
        onCancel={() => setApproveListId(null)}
        onConfirm={() => void executeApprove(approveListId)}
      />

      <InputDialog
        open={!!rejectListId}
        title="Reject Enrollment List"
        message="Reject this combined list back down the chain?"
        inputLabel="Remark (optional)"
        inputPlaceholder="Reason for rejection"
        confirmLabel="Reject"
        onCancel={() => setRejectListId(null)}
        onConfirm={(val) => void executeReject(rejectListId, val)}
      />
    </section>
  );
}

export { SuperadminExamPendingListsPage };
