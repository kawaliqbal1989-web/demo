import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  createStudentNote,
  deleteNote,
  listMyStudents,
  listStudentNotes,
  updateNote
} from "../../services/teacherPortalService";

function TeacherNotesPage() {
  const [searchParams] = useSearchParams();
  const initialStudentId = searchParams.get("studentId") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [students, setStudents] = useState([]);
  const [studentId, setStudentId] = useState(initialStudentId);

  const [notesLoading, setNotesLoading] = useState(false);
  const [notes, setNotes] = useState([]);

  const [noteText, setNoteText] = useState("");
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const studentOptions = useMemo(() => {
    const map = new Map();
    for (const s of students) {
      if (!map.has(s.studentId)) map.set(s.studentId, s);
    }
    return Array.from(map.values());
  }, [students]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const s = await listMyStudents();
      const items = s.data || [];
      setStudents(items);
      if (!studentId && items.length) {
        setStudentId(items[0].studentId);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  const loadNotes = async (id) => {
    if (!id) {
      setNotes([]);
      return;
    }

    setNotesLoading(true);
    setError("");
    try {
      const res = await listStudentNotes(id, { limit: 100, offset: 0 });
      setNotes(res.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load notes.");
    } finally {
      setNotesLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (studentId) void loadNotes(studentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!studentId || !noteText.trim()) return;

    setError("");
    try {
      await createStudentNote(studentId, { note: noteText.trim() });
      setNoteText("");
      await loadNotes(studentId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to add note.");
    }
  };

  const onEdit = async (n) => {
    setEditTarget(n);
  };

  const handleEditConfirm = async (value) => {
    if (!editTarget) return;
    setError("");
    try {
      await updateNote(editTarget.id, { note: value });
      await loadNotes(studentId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update note");
    } finally {
      setEditTarget(null);
    }
  };

  const onDelete = async (n) => {
    setDeleteTarget(n);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setError("");
    try {
      await deleteNote(deleteTarget.id);
      await loadNotes(studentId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to delete note");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return <LoadingState label="Loading notes..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Notes</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Private notes for your assigned students</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <label>
          Student
          <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select</option>
            {studentOptions.map((s) => (
              <option key={s.studentId} value={s.studentId}>
                {s.admissionNo} - {s.fullName}
              </option>
            ))}
          </select>
        </label>

        <form onSubmit={onAdd} style={{ display: "grid", gap: 8 }}>
          <label>
            Add note
            <textarea className="input" style={{ minHeight: 90 }} value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Write a note..." />
          </label>
          <button className="button" style={{ width: "auto" }} disabled={!studentId || !noteText.trim()}>
            Add Note
          </button>
        </form>
      </div>

      {!studentId ? (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>Select a student to view notes.</div>
      ) : notesLoading ? (
        <LoadingState label="Loading notes..." />
      ) : (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h3 style={{ margin: 0 }}>Notes Timeline</h3>
          {!notes.length ? (
            <div style={{ color: "var(--color-text-muted)" }}>No notes yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {notes.map((n) => (
                <div key={n.id} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{String(n.createdAt || "").slice(0, 10)}</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="button secondary" style={{ width: "auto" }} onClick={() => onEdit(n)}>
                        Edit
                      </button>
                      <button className="button secondary" style={{ width: "auto" }} onClick={() => onDelete(n)}>
                        Delete
                      </button>
                    </div>
                  </div>
                  <div>{n.note}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <InputDialog
        open={!!editTarget}
        title="Edit Note"
        message="Update the note text below."
        inputLabel="Note"
        inputPlaceholder="Enter note…"
        confirmLabel="Save"
        defaultValue={editTarget?.note || ""}
        onConfirm={handleEditConfirm}
        onCancel={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Note"
        message="Are you sure you want to delete this note? This cannot be undone."
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}

export { TeacherNotesPage };
