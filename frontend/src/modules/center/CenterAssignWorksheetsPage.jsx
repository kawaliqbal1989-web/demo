import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { getCenterAssignWorksheets, saveCenterAssignWorksheets } from "../../services/centerWorksheetAssignmentsService";

function StudentLabel({ student }) {
  const label = student?.fullName
    ? `${student.fullName} (${student.studentCode || ""})`.trim()
    : "—";
  return <div>{label}</div>;
}

function CenterAssignWorksheetsPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [assignedIds, setAssignedIds] = useState(() => new Set());
  const [previousAssignedIds, setPreviousAssignedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    getCenterAssignWorksheets(studentId)
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
                  <th>Reassign</th>
                </tr>
              </thead>
              <tbody>
                {worksheets.map((w) => {
                  const checked = selectedIds.has(w.worksheetId);
                  const isAssigned = assignedIds.has(w.worksheetId);
                  const wasPrev = previousAssignedIds.has(w.worksheetId) || Boolean(w.wasPreviouslyAssigned);
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No worksheets available for this enrollment.</div>
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
                await saveCenterAssignWorksheets(studentId, {
                  worksheetIds: Array.from(assignedIds)
                });
              } catch {
                setError("Failed to save assignments.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Save Assignments
          </button>
          <button className="button secondary" style={{ width: "auto" }} onClick={() => navigate("/center/students")}>
            Close
          </button>
        </div>
      </div>
    </section>
  );
}

export { CenterAssignWorksheetsPage };
