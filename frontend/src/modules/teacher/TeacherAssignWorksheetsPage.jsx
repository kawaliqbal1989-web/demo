import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getTeacherAssignWorksheets, saveTeacherAssignWorksheets, teacherDirectReassign } from "../../services/teacherPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function StudentLabel({ student }) {
  const label = student?.fullName
    ? `${student.fullName} (${student.studentCode || ""})`.trim()
    : "—";
  return <div>{label}</div>;
}

function TeacherAssignWorksheetsPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assignedIds, setAssignedIds] = useState(() => new Set());
  const [previousAssignedIds, setPreviousAssignedIds] = useState(() => new Set());

  // Reassign modal state
  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignReason, setReassignReason] = useState("");
  const [reassignType, setReassignType] = useState("RETRY");
  const [reassignNewWsId, setReassignNewWsId] = useState("");
  const [reassigning, setReassigning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getTeacherAssignWorksheets(studentId)
      .then((res) => {
        if (cancelled) return;
        const payload = res.data?.data || null;
        const existing = Array.isArray(payload?.assignedWorksheetIds) ? payload.assignedWorksheetIds : [];
        const previous = Array.isArray(payload?.previousAssignedWorksheetIds) ? payload.previousAssignedWorksheetIds : [];
        setData(payload);
        setSelectedIds(new Set(existing));
        setAssignedIds(new Set(existing));
        setPreviousAssignedIds(new Set(previous));
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load worksheet assignments.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const worksheets = Array.isArray(data?.worksheets) ? data.worksheets : [];
  const courseLevel = data?.enrollment?.courseCode && data?.enrollment?.levelRank != null
    ? `${data.enrollment.courseCode} / ${data.enrollment.levelRank}`
    : "—";

  const allSelected = worksheets.length > 0 && selectedIds.size === worksheets.length;

  const assignedCount = useMemo(() => assignedIds.size, [assignedIds]);
  const previousAssignedCount = useMemo(() => previousAssignedIds.size, [previousAssignedIds]);

  if (loading) {
    return <LoadingState label="Loading assignments..." />;
  }

  return (
    <section className="dash-section">
      <div className="dash-header">
        <div>
          <h2 style={{ margin: 0 }}>Assign Worksheets</h2>
        </div>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="info-grid">
          <div className="info-grid__label">Student</div>
          <div className="info-grid__value">
            <StudentLabel student={data?.student} />
          </div>

          <div className="info-grid__label">Course / Level</div>
          <div className="info-grid__value">{courseLevel}</div>
        </div>
      </div>

      <div className="card dash-card">
        <div className="dash-card__title">Worksheets</div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={allSelected}
              disabled={!worksheets.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(new Set(worksheets.map((w) => w.worksheetId)));
                } else {
                  setSelectedIds(new Set());
                }
              }}
            />
            <span>Select all worksheets</span>
          </label>

          <button
            className="button"
            style={{ width: "auto" }}
            disabled={!selectedIds.size}
            onClick={() => {
              setAssignedIds(new Set(selectedIds));
            }}
          >
            Assign
          </button>
          <div className="muted" style={{ fontSize: 12 }}>
            {assignedCount ? `${assignedCount} selected` : ""}
            {previousAssignedCount ? ` • ${previousAssignedCount} previously assigned` : ""}
          </div>
        </div>

        {worksheets.length ? (
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Number</th>
                  <th>Title</th>
                  <th>Attempt</th>
                  <th>Assign</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {worksheets.map((w) => {
                  const checked = selectedIds.has(w.worksheetId);
                  const isAssigned = assignedIds.has(w.worksheetId);
                  const wasPrev = previousAssignedIds.has(w.worksheetId) || Boolean(w.wasPreviouslyAssigned);
                  const hasAttempt = (w.attempt ?? 0) > 0;
                  const canReassign = Boolean(w.isSubmitted);
                  return (
                    <tr key={w.worksheetId}>
                      <td>{w.number}</td>
                      <td>{w.title}</td>
                      <td>{w.attempt ?? 0}</td>
                      <td>
                        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(w.worksheetId);
                                else next.delete(w.worksheetId);
                                return next;
                              });
                            }}
                          />
                          <span className="muted" style={{ fontSize: 12 }}>
                            {isAssigned ? "Assigned" : wasPrev ? "Previously assigned" : ""}
                          </span>
                        </label>
                      </td>
                      <td>
                        {canReassign ? (
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "4px 10px" }}
                            onClick={() => {
                              setReassignTarget(w);
                              setReassignReason("");
                              setReassignType("RETRY");
                              setReassignNewWsId("");
                            }}
                          >
                            Reassign
                          </button>
                        ) : hasAttempt ? (
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "4px 10px" }}
                            disabled
                            title="Only submitted worksheets can be reassigned."
                          >
                            Submit first
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No worksheets available for this student level.</div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
          <button
            className="button"
            style={{ width: "auto" }}
            disabled={saving || !worksheets.length}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await saveTeacherAssignWorksheets(studentId, {
                  worksheetIds: Array.from(assignedIds)
                });
              } catch (err) {
                setError(getFriendlyErrorMessage(err) || "Failed to save assignments.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Save Assignments
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => navigate(`/teacher/students/${studentId}`)}>
            Close
          </button>
        </div>
      </div>

      {/* Reassign Dialog */}
      {reassignTarget ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 480, width: "90%" }}>
            <div className="dash-card__title">Reassign Worksheet</div>
            <p style={{ margin: "8px 0" }}>
              <strong>{reassignTarget.title}</strong> (#{reassignTarget.number})
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Type</label>
              <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="reassignType" value="RETRY" checked={reassignType === "RETRY"} onChange={() => setReassignType("RETRY")} />
                  Retry (same worksheet)
                </label>
                <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <input type="radio" name="reassignType" value="SWAP" checked={reassignType === "SWAP"} onChange={() => setReassignType("SWAP")} />
                  Swap (different worksheet)
                </label>
              </div>
            </div>

            {reassignType === "SWAP" ? (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>New Worksheet</label>
                <select className="input" value={reassignNewWsId} onChange={(e) => setReassignNewWsId(e.target.value)} style={{ marginTop: 4 }}>
                  <option value="">-- select --</option>
                  {worksheets.filter((w) => w.worksheetId !== reassignTarget.worksheetId).map((w) => (
                    <option key={w.worksheetId} value={w.worksheetId}>{w.number}. {w.title}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>Reason *</label>
              <textarea
                className="input"
                rows={3}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Why is this reassignment needed?"
                style={{ marginTop: 4 }}
              />
            </div>

            {error ? <p className="error" style={{ fontSize: 13, margin: "0 0 8px" }}>{error}</p> : null}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={reassigning || !reassignReason.trim() || (reassignType === "SWAP" && !reassignNewWsId)}
                onClick={async () => {
                  setReassigning(true);
                  setError("");
                  try {
                    await teacherDirectReassign(studentId, {
                      currentWorksheetId: reassignTarget.worksheetId,
                      type: reassignType,
                      newWorksheetId: reassignType === "SWAP" ? reassignNewWsId : undefined,
                      reason: reassignReason.trim(),
                    });
                    setReassignTarget(null);
                    // Reload data
                    const res = await getTeacherAssignWorksheets(studentId);
                    const payload = res.data?.data || null;
                    setData(payload);
                    const existing = Array.isArray(payload?.assignedWorksheetIds) ? payload.assignedWorksheetIds : [];
                    const previous = Array.isArray(payload?.previousAssignedWorksheetIds) ? payload.previousAssignedWorksheetIds : [];
                    setSelectedIds(new Set(existing));
                    setAssignedIds(new Set(existing));
                    setPreviousAssignedIds(new Set(previous));
                  } catch (err) {
                    setError(getFriendlyErrorMessage(err) || "Reassignment failed.");
                  } finally {
                    setReassigning(false);
                  }
                }}
              >
                {reassigning ? "Processing..." : "Confirm Reassign"}
              </button>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setReassignTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { TeacherAssignWorksheetsPage };
