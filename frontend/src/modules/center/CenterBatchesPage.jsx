import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { createBatch, listBatches, setBatchTeachers, updateBatch } from "../../services/batchesService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function CenterBatchesPage() {
  const [rows, setRows] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [creating, setCreating] = useState(false);

  const [editTarget, setEditTarget] = useState(null);
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editTeacherIds, setEditTeacherIds] = useState([]);
  const [saving, setSaving] = useState(false);

  const teacherOptions = useMemo(() => teachers.filter((t) => t?.role === "TEACHER"), [teachers]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [batchesRes, teachersRes] = await Promise.all([
        listBatches({ limit: 100, offset: 0 }),
        listTeachers({ limit: 200, offset: 0 })
      ]);
      setRows(batchesRes.data?.items || []);
      setTeachers(teachersRes.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load batches.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      await createBatch({ name, status });
      setName("");
      setStatus("ACTIVE");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create batch.");
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (row) => {
    setEditTarget(row);
    setEditName(row?.name || "");
    setEditStatus(row?.status || "ACTIVE");
    const current = (row?.teacherAssignments || []).map((a) => a?.teacher?.id).filter(Boolean);
    setEditTeacherIds(current);
  };

  const toggleTeacher = (teacherId) => {
    setEditTeacherIds((prev) => (prev.includes(teacherId) ? prev.filter((x) => x !== teacherId) : [...prev, teacherId]));
  };

  const saveEdit = async () => {
    if (!editTarget?.id) return;
    setSaving(true);
    try {
      await updateBatch(editTarget.id, { name: editName, status: editStatus });
      await setBatchTeachers(editTarget.id, editTeacherIds);
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading batches..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Batches</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create batches (classes/groups) and assign teachers</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <form className="card" onSubmit={onCreate} style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Create Batch</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
          <input className="input" placeholder="Batch name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
        </div>
        <button className="button" style={{ width: "auto" }} disabled={creating}>
          {creating ? "Creating..." : "Create"}
        </button>
      </form>

      {editTarget ? (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Edit Batch</h3>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => setEditTarget(null)}>
              Close
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 10 }}>
            <input className="input" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <select className="select" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="ARCHIVED">ARCHIVED</option>
            </select>
          </div>

          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Assigned teachers</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {teacherOptions.map((t) => (
              <label key={t.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={editTeacherIds.includes(t.id)}
                  onChange={() => toggleTeacher(t.id)}
                />
                <span>
                  {t?.teacherProfile?.fullName || t.username} ({t.email})
                </span>
              </label>
            ))}
            {!teacherOptions.length ? <div style={{ color: "var(--color-text-muted)" }}>No teachers found.</div> : null}
          </div>

          <button className="button" style={{ width: "auto" }} disabled={saving} onClick={saveEdit}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "name", header: "Batch" },
          { key: "status", header: "Status" },
          {
            key: "teachers",
            header: "Teachers",
            render: (r) => (r?.teacherAssignments || []).map((a) => a?.teacher?.username).filter(Boolean).join(", ")
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <button className="button secondary" style={{ width: "auto" }} onClick={() => openEdit(r)}>
                Edit
              </button>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />
    </section>
  );
}

export { CenterBatchesPage };
