import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  createStudentNote,
  deleteStudentNote,
  exportStudentNotesCsv,
  listStudentNotes,
  updateStudentNote
} from "../../services/notesService";

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((t) => String(t)).filter(Boolean);
  if (typeof value === "string") return [value].filter(Boolean);
  if (typeof value === "object") {
    return Object.values(value).map((t) => String(t)).filter(Boolean);
  }
  return [];
}

function toTagsPayload(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((t) => String(t).trim())
    .filter(Boolean);
}

function CenterStudentNotesPage() {
  const { studentId } = useParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const [notesLoading, setNotesLoading] = useState(false);
  const [items, setItems] = useState([]);

  const [noteText, setNoteText] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);

  // Dialog state for edit (two-step: text then tags)
  const [editTarget, setEditTarget] = useState(null);
  const [editStep, setEditStep] = useState("text"); // "text" | "tags"
  const [editTextValue, setEditTextValue] = useState("");
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);

  const params = useMemo(
    () => ({
      limit,
      offset,
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {})
    }),
    [limit, offset, q, from, to]
  );

  const load = async (overrides = {}) => {
    if (!studentId) return;

    const effectiveParams = {
      ...params,
      ...overrides
    };

    setNotesLoading(true);
    setError("");
    try {
      const res = await listStudentNotes(studentId, effectiveParams);
      setItems(res?.data?.items || []);
      setTotal(Number(res?.data?.total || 0));
      setLimit(Number(res?.data?.limit || limit));
      setOffset(Number(res?.data?.offset || offset));
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load notes.");
    } finally {
      setNotesLoading(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, params.limit, params.offset, params.q, params.from, params.to]);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!studentId || !noteText.trim()) return;

    setSaving(true);
    setError("");
    try {
      await createStudentNote(studentId, {
        note: noteText.trim(),
        tags: toTagsPayload(tagsText)
      });
      setNoteText("");
      setTagsText("");
      setOffset(0);
      await load({ offset: 0 });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to add note.");
    } finally {
      setSaving(false);
    }
  };

  const onEdit = (note) => {
    setEditTarget(note);
    setEditStep("text");
    setEditTextValue("");
  };

  const handleEditTextConfirm = (value) => {
    setEditTextValue(value);
    setEditStep("tags");
  };

  const handleEditTagsConfirm = async (value) => {
    const note = editTarget;
    setEditTarget(null);
    if (!note) return;

    setSaving(true);
    setError("");
    try {
      await updateStudentNote(note.id, {
        note: String(editTextValue).trim(),
        tags: toTagsPayload(value)
      });
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to update note.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (note) => {
    setDeleteTarget(note);
  };

  const handleDeleteConfirm = async () => {
    const note = deleteTarget;
    setDeleteTarget(null);
    if (!note) return;

    setSaving(true);
    setError("");
    try {
      await deleteStudentNote(note.id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to delete note.");
    } finally {
      setSaving(false);
    }
  };

  const onExport = async () => {
    if (!studentId) return;
    setSaving(true);
    setError("");
    try {
      await exportStudentNotesCsv(studentId, {
        q: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined
      });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to export notes.");
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "createdAt",
        header: "Date",
        render: (row) => String(row?.createdAt || "").slice(0, 10)
      },
      {
        key: "teacher",
        header: "Author",
        render: (row) => row?.teacher?.teacherProfile?.fullName || row?.teacher?.username || row?.teacher?.email || ""
      },
      {
        key: "note",
        header: "Note",
        wrap: true,
        render: (row) => (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ whiteSpace: "pre-wrap" }}>{row.note}</div>
            {normalizeTags(row.tags).length ? (
              <div className="chip-row">
                {normalizeTags(row.tags).map((t) => (
                  <span key={t} className="chip" style={{ padding: "6px 10px", fontSize: 12 }}>
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )
      },
      {
        key: "actions",
        header: "Actions",
        render: (row) => (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button secondary" style={{ width: "auto" }} disabled={saving} onClick={() => void onEdit(row)}>
              Edit
            </button>
            <button className="button secondary" style={{ width: "auto" }} disabled={saving} onClick={() => void onDelete(row)}>
              Delete
            </button>
          </div>
        )
      }
    ],
    [saving]
  );

  if (loading) {
    return <LoadingState label="Loading notes..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Notes</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Student notes (Center)</div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/center/students">
          Back to Students
        </Link>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, alignItems: "end" }}>
          <label>
            Search
            <input
              className="input"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
              }}
              placeholder="Search in notes..."
            />
          </label>
          <label>
            From (YYYY-MM-DD)
            <input
              className="input"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setOffset(0);
              }}
              placeholder="2026-02-01"
            />
          </label>
          <label>
            To (YYYY-MM-DD)
            <input
              className="input"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setOffset(0);
              }}
              placeholder="2026-02-24"
            />
          </label>
          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onExport} disabled={saving}>
            Export CSV
          </button>
          <button className="button" type="button" style={{ width: "auto" }} onClick={load} disabled={notesLoading}>
            {notesLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <form onSubmit={onAdd} style={{ display: "grid", gap: 8 }}>
          <label>
            Add note
            <textarea
              className="input"
              style={{ minHeight: 90 }}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Write a note..."
            />
          </label>
          <label>
            Tags (comma-separated)
            <input className="input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. payment, behavior" />
          </label>
          <button className="button" style={{ width: "auto" }} disabled={saving || !noteText.trim()}>
            {saving ? "Saving..." : "Add Note"}
          </button>
        </form>
      </div>

      <InputDialog
        open={!!editTarget && editStep === "text"}
        title="Edit Note"
        message="Update the note text"
        inputLabel="Note"
        defaultValue={editTarget?.note || ""}
        confirmLabel="Next"
        onConfirm={handleEditTextConfirm}
        onCancel={() => setEditTarget(null)}
      />

      <InputDialog
        open={!!editTarget && editStep === "tags"}
        title="Edit Tags"
        message="Comma-separated tags"
        inputLabel="Tags"
        defaultValue={normalizeTags(editTarget?.tags).join(", ")}
        confirmLabel="Save"
        onConfirm={handleEditTagsConfirm}
        onCancel={() => setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Note"
        message="Are you sure you want to delete this note?"
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <DataTable columns={columns} rows={items} keyField="id" />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={items.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
        }}
      />
    </section>
  );
}

export { CenterStudentNotesPage };
