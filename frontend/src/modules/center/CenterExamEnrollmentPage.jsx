import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { listLevels } from "../../services/levelsService";
import {
  centerRejectTeacherList,
  createCenterTemporaryStudents,
  exportEnrollmentListCsv,
  prepareCenterCombinedEnrollmentList,
  setCenterCombinedListItemIncluded,
  submitCenterCombinedEnrollmentList
} from "../../services/examCyclesService";

function CenterExamEnrollmentPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [list, setList] = useState(null);
  const [levels, setLevels] = useState([]);

  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatingTemp, setCreatingTemp] = useState(false);

  const [tempFirstName, setTempFirstName] = useState("");
  const [tempLastName, setTempLastName] = useState("");
  const [tempLevelId, setTempLevelId] = useState("");
  const [tempPassword, setTempPassword] = useState("Pass@123");

  const [createdTemp, setCreatedTemp] = useState([]);

  const [rejectingListId, setRejectingListId] = useState(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const canEdit = useMemo(() => {
    const status = String(list?.status || "");
    const locked = Boolean(list?.locked);
    if (status === "REJECTED") return true;
    if (status === "DRAFT") return true;
    if (locked) return false;
    return status === "DRAFT";
  }, [list]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [levelsRes, listRes] = await Promise.all([
        listLevels(),
        prepareCenterCombinedEnrollmentList(examCycleId)
      ]);

      setLevels(levelsRes?.data || []);
      setList(listRes?.data || null);
      setCreatedTemp([]);

      const firstLevel = (levelsRes?.data || [])[0];
      setTempLevelId(firstLevel?.id || "");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load combined enrollment list.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const items = Array.isArray(list?.items) ? list.items : [];
  const selectedCount = useMemo(() => {
    return items.filter((i) => i?.included !== false).length;
  }, [items]);

  const prepareNow = async () => {
    if (preparing) return;
    setPreparing(true);
    setError("");
    try {
      const listRes = await prepareCenterCombinedEnrollmentList(examCycleId);
      setList(listRes?.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to prepare combined list.");
    } finally {
      setPreparing(false);
    }
  };

  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const submitToFranchise = async () => {
    if (submitting) return;
    setSubmitConfirmOpen(false);

    setSubmitting(true);
    setError("");
    try {
      await submitCenterCombinedEnrollmentList(examCycleId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit list.");
    } finally {
      setSubmitting(false);
    }
  };

  const createTempStudent = async () => {
    if (creatingTemp || !canEdit) return;
    if (!tempLevelId) {
      setError("Please select a level.");
      return;
    }

    setCreatingTemp(true);
    setError("");
    try {
      const payload = {
        students: [
          {
            firstName: tempFirstName,
            lastName: tempLastName,
            levelId: tempLevelId,
            password: tempPassword
          }
        ]
      };

      const res = await createCenterTemporaryStudents(examCycleId, payload);
      const created = Array.isArray(res?.data) ? res.data : [];
      setCreatedTemp(created);
      await load();

      setTempFirstName("");
      setTempLastName("");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create temporary student.");
    } finally {
      setCreatingTemp(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading combined enrollment..." />;
  }

  const toggleIncluded = async (row, nextIncluded) => {
    if (!canEdit) return;
    const entryId = row?.entryId || row?.entry?.id;
    if (!entryId) return;

    // Optimistic update
    setList((prev) => {
      if (!prev) return prev;
      const nextItems = Array.isArray(prev.items)
        ? prev.items.map((it) => (it?.entryId === entryId ? { ...it, included: nextIncluded } : it))
        : prev.items;
      return { ...prev, items: nextItems };
    });

    try {
      await setCenterCombinedListItemIncluded(examCycleId, entryId, { included: nextIncluded });
    } catch (err) {
      // Rollback by reloading (keeps server as source of truth)
      setError(getFriendlyErrorMessage(err) || "Failed to update selection.");
      await load();
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Center Exam Enrollment</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: <b>{list?.status || ""}</b> {list?.locked ? "(Locked)" : ""}
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      {/* Teacher Lists Section */}
      {Array.isArray(list?.teacherLists) && list.teacherLists.length > 0 && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>📋 Submitted Teacher Lists</div>
          <DataTable
            keyField={(r) => r.id}
            columns={[
              {
                key: "teacher",
                header: "Teacher",
                render: (r) => {
                  const t = r.teacherUser;
                  const name = t?.teacherProfile?.fullName || "";
                  const code = t?.username || "";
                  return name && code ? `${name} (${code})` : name || code || "—";
                }
              },
              { key: "count", header: "Students", render: (r) => r._count?.items ?? 0 },
              {
                key: "status",
                header: "Status",
                render: (r) => (
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                    background: r.status === "SUBMITTED_TO_CENTER" ? "var(--color-bg-info-light)" : r.status === "REJECTED" ? "var(--color-bg-danger-light)" : "var(--color-bg-muted)",
                    color: r.status === "SUBMITTED_TO_CENTER" ? "#1d4ed8" : r.status === "REJECTED" ? "#dc2626" : "var(--color-text-label)"
                  }}>{r.status?.replace(/_/g, " ") || "—"}</span>
                )
              },
              {
                key: "submitted",
                header: "Submitted",
                render: (r) => r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : "—"
              },
              {
                key: "actions",
                header: "",
                render: (r) => {
                  if (r.status !== "SUBMITTED_TO_CENTER") return null;
                  if (rejectingListId === r.id) {
                    return (
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input
                          className="input"
                          placeholder="Remark (optional)"
                          value={rejectRemark}
                          onChange={(e) => setRejectRemark(e.target.value)}
                          style={{ width: 160, fontSize: 12 }}
                          disabled={rejecting}
                        />
                        <button
                          className="button"
                          style={{ width: "auto", fontSize: 12, background: "#dc2626" }}
                          disabled={rejecting}
                          onClick={async () => {
                            setRejecting(true);
                            try {
                              await centerRejectTeacherList(examCycleId, r.id, { remark: rejectRemark });
                              setRejectingListId(null);
                              setRejectRemark("");
                              await load();
                            } catch (err) {
                              setError(getFriendlyErrorMessage(err) || "Failed to reject teacher list.");
                            } finally {
                              setRejecting(false);
                            }
                          }}
                        >
                          {rejecting ? "Rejecting..." : "Confirm"}
                        </button>
                        <button
                          className="button secondary"
                          style={{ width: "auto", fontSize: 12 }}
                          disabled={rejecting}
                          onClick={() => { setRejectingListId(null); setRejectRemark(""); }}
                        >
                          Cancel
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      className="button secondary"
                      style={{ width: "auto", fontSize: 12, color: "#dc2626" }}
                      disabled={!canEdit}
                      onClick={() => { setRejectingListId(r.id); setRejectRemark(""); }}
                    >
                      Reject
                    </button>
                  );
                }
              }
            ]}
            rows={list.teacherLists}
          />
        </div>
      )}

      <div className="card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="button secondary" type="button" onClick={() => void prepareNow()} disabled={preparing} style={{ width: "auto" }}>
          {preparing ? "Preparing..." : "Prepare / Refresh Combined List"}
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={async () => {
            try {
              if (!list?.id) return;
              const resp = await exportEnrollmentListCsv(examCycleId, list.id);
              downloadBlob(resp.data, `exam_enrollment_${examCycleId}_${list.id}.csv`);
            } catch (err) {
              toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
            }
          }}
          style={{ width: "auto" }}
          disabled={!list?.id}
        >
          Export CSV
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Selected: <b>{selectedCount}</b> / {items.length}
        </div>
        <button
          className="button"
          type="button"
          onClick={() => setSubmitConfirmOpen(true)}
          disabled={
            submitting ||
            selectedCount === 0 ||
            String(list?.status || "") === "SUBMITTED_TO_FRANCHISE"
          }
          style={{ width: "auto" }}
        >
          {submitting ? "Submitting..." : "Submit to Franchise"}
        </button>
      </div>

      <ConfirmDialog
        open={submitConfirmOpen}
        title="Submit to Franchise"
        message="Submit this combined enrollment list to Franchise? After submission, editing will be locked unless rejected."
        confirmLabel="Submit"
        onConfirm={submitToFranchise}
        onCancel={() => setSubmitConfirmOpen(false)}
      />

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 600 }}>Create Temporary Student</div>
          <div style={{ flex: 1 }} />
          {!canEdit ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Editing is locked.</div> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>First Name</label>
            <input className="input" value={tempFirstName} onChange={(e) => setTempFirstName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Last Name</label>
            <input className="input" value={tempLastName} onChange={(e) => setTempLastName(e.target.value)} disabled={!canEdit} />
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Level</label>
            <select className="input" value={tempLevelId} onChange={(e) => setTempLevelId(e.target.value)} disabled={!canEdit}>
              <option value="">Select level</option>
              {levels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} / {l.rank}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--muted)" }}>Password</label>
            <input className="input" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} disabled={!canEdit} />
          </div>

          <button
            className="button"
            type="button"
            onClick={() => void createTempStudent()}
            disabled={!canEdit || creatingTemp}
            style={{ width: "auto" }}
          >
            {creatingTemp ? "Creating..." : "Create"}
          </button>
        </div>

        {createdTemp.length ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Created: {createdTemp.map((c) => c?.user?.username).filter(Boolean).join(", ")}
          </div>
        ) : null}
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Combined Enrollment (Students)</div>

        <DataTable
          columns={[
            {
              key: "included",
              header: "Select",
              render: (r) => {
                const checked = r?.included !== false;
                return (
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!canEdit}
                    onChange={(e) => void toggleIncluded(r, Boolean(e.target.checked))}
                  />
                );
              }
            },
            { key: "code", header: "Student Code", render: (r) => r?.entry?.student?.admissionNo || "" },
            {
              key: "student",
              header: "Student Name",
              render: (r) => {
                const s = r?.entry?.student;
                return s ? `${s.firstName} ${s.lastName}`.trim() : "";
              }
            },
            {
              key: "teacher",
              header: "Teacher",
              render: (r) => {
                const t = r?.entry?.sourceTeacherUser;
                if (!t) return "";
                const code = t.username || "";
                const name = t.teacherProfile?.fullName || "";
                if (name && code) return `${name} (${code})`;
                return name || code;
              }
            },
            {
              key: "temporary",
              header: "Temporary",
              render: (r) => (r?.entry?.student?.isTemporaryExam ? "Yes" : "No")
            },
            {
              key: "level",
              header: "Level",
              render: (r) => {
                const lvl = r?.entry?.enrolledLevel;
                return lvl ? `${lvl.name} / ${lvl.rank}` : "";
              }
            }
          ]}
          rows={items}
          keyField={(row) => row?.entry?.student?.id || row?.entryId || row?.createdAt}
        />
      </div>
    </section>
  );
}

export { CenterExamEnrollmentPage };
