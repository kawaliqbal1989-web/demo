import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getCourse } from "../../services/coursesService";
import { createCourseLevel, deleteCourseLevel, listCourseLevels, updateCourseLevel } from "../../services/courseLevelsService";

function statusFromLevel(level) {
  return level?.isActive === false ? "INACTIVE" : "ACTIVE";
}

function SuperadminCourseLevelsPage() {
  const { id } = useParams();
  const courseId = id;
  const navigate = useNavigate();

  const [course, setCourse] = useState(null);
  const [loadingCourse, setLoadingCourse] = useState(true);

  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [statusFilter, setStatusFilter] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusActionTarget, setStatusActionTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    levelNumber: "1",
    title: "",
    sortOrder: "1",
    status: "ACTIVE"
  });

  const loadCourse = async () => {
    setLoadingCourse(true);
    try {
      const data = await getCourse(courseId);
      setCourse(data?.data || null);
    } catch {
      setCourse(null);
    } finally {
      setLoadingCourse(false);
    }
  };

  const load = async (next = { limit, offset, status: statusFilter }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listCourseLevels({ courseId, ...next });
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load course levels.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourse();
    void load({ limit, offset, status: statusFilter });
  }, []);

  if (loadingCourse) {
    return <LoadingState label="Loading course..." />;
  }

  const resetForm = () => {
    setEditingId(null);
    setFormError("");
    setForm({ levelNumber: "1", title: "", sortOrder: "1", status: "ACTIVE" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const levelNumber = Number(form.levelNumber);
      const sortOrder = Number(form.sortOrder);

      if (!Number.isInteger(levelNumber) || levelNumber < 1 || levelNumber > 15) {
        setFormError("Level Number must be between 1 and 15.");
        return;
      }

      if (!form.title || !String(form.title).trim()) {
        setFormError("Title is required.");
        return;
      }

      if (!Number.isInteger(sortOrder)) {
        setFormError("Sort Order must be an integer.");
        return;
      }

      if (editingId) {
        await updateCourseLevel({
          courseId,
          id: editingId,
          title: form.title,
          sortOrder,
          status: form.status === "INACTIVE" ? "ARCHIVED" : form.status
        });
      } else {
        await createCourseLevel({
          courseId,
          levelNumber,
          title: form.title,
          sortOrder,
          status: form.status === "INACTIVE" ? "ARCHIVED" : form.status
        });
      }

      resetForm();
      setOffset(0);
      await load({ limit, offset: 0, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to save level.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (level) => {
    setEditingId(level.id);
    setFormError("");
    setForm({
      levelNumber: String(level.levelNumber),
      title: level.title,
      sortOrder: String(level.sortOrder),
      status: statusFromLevel(level)
    });
  };

  const handleToggleStatus = async (level) => {
    try {
      await updateCourseLevel({
        courseId,
        id: level.id,
        status: level.isActive ? "ARCHIVED" : "ACTIVE"
      });
      await load({ limit, offset, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to update level status.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteCourseLevel({ courseId, id: deleteTarget.id });
      setDeleteTarget(null);
      await load({ limit, offset, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to delete level.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusFilterChange = (nextStatus) => {
    setStatusFilter(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, status: nextStatus });
  };

  const executeStatusAction = async () => {
    const target = statusActionTarget;
    setStatusActionTarget(null);
    if (!target?.level) {
      return;
    }

    try {
      await updateCourseLevel({
        courseId,
        id: target.level.id,
        status: target.action === "ACTIVATE" ? "ACTIVE" : "ARCHIVED"
      });

      if (editingId === target.level.id) {
        setForm((prev) => ({
          ...prev,
          status: target.action === "ACTIVATE" ? "ACTIVE" : "INACTIVE"
        }));
      }

      await load({ limit, offset, status: statusFilter });
    } catch (err) {
      setFormError(
        getFriendlyErrorMessage(err) ||
          (target.action === "ACTIVATE" ? "Failed to activate level." : "Failed to deactivate level.")
      );
    }
  };

  const executeDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target?.id) {
      return;
    }

    setDeleting(true);
    setFormError("");
    try {
      await deleteCourseLevel({ courseId, id: target.id });
      if (editingId === target.id) {
        resetForm();
      }

      const shouldResetPage = rows.length === 1 && offset > 0;
      const nextOffset = shouldResetPage ? Math.max(0, offset - limit) : offset;
      setOffset(nextOffset);
      await load({ limit, offset: nextOffset, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to delete level.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Course Levels: {course?.name || "Course"}</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage levels 1-15 for the selected course.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate("/superadmin/courses")}
        >
          Back to Courses
        </button>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => void load({ limit, offset, status: statusFilter })}
        >
          Refresh
        </button>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Level Number
              <input
                className="input"
                inputMode="numeric"
                value={form.levelNumber}
                onChange={(e) => setForm((p) => ({ ...p, levelNumber: e.target.value }))}
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Title
              <input
                className="input"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              />
            </label>
            <label>
              Sort Order
              <input
                className="input"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
              />
            </label>
            <label>
              Status
              <select
                className="select"
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              >
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </label>
          </div>

          {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
            <button className="button" type="submit" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Level" : "Create Level"}
            </button>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={resetForm} disabled={saving}>
              Reset
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Level</h3>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="select"
          value={statusFilter}
          onChange={(e) => handleStatusFilterChange(e.target.value)}
          style={{ width: 160 }}
        >
          <option value="">All Status</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="ARCHIVED">INACTIVE</option>
        </select>
      </div>

      {loading && !rows.length ? <LoadingState label="Loading levels..." /> : null}

      <DataTable
        columns={[
          { key: "levelNumber", header: "Level" },
          { key: "title", header: "Title" },
          { key: "sortOrder", header: "Sort" },
          { key: "status", header: "Status", render: (r) => <StatusBadge value={statusFromLevel(r)} /> },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => handleEdit(r)}>
                  Edit
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${r.levelNumber}`)}
                >
                  Engine
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${r.levelNumber}/question-bank`)}
                >
                  Question Bank
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${r.levelNumber}/worksheets`)}
                >
                  Worksheets
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => setStatusActionTarget({ level: r, action: "ACTIVATE" })}
                  disabled={r?.isActive === true}
                >
                  Activate
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => setStatusActionTarget({ level: r, action: "DEACTIVATE" })}
                  disabled={r?.isActive === false}
                >
                  Deactivate
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => setDeleteTarget(r)}
                  disabled={deleting}
                >
                  Delete
                </button>
                >
                  Delete
                </button>
              </div>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ ...next, status: statusFilter });
        }}
      />

      <ConfirmDialog
        open={!!statusActionTarget}
        title={statusActionTarget?.action === "ACTIVATE" ? "Activate Level" : "Deactivate Level"}
        message={`${statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Deactivate"} Level ${statusActionTarget?.level?.levelNumber || ""} ${statusActionTarget?.level?.title ? `(${statusActionTarget.level.title})` : ""}?`}
        confirmLabel={statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Deactivate"}
        onCancel={() => setStatusActionTarget(null)}
        onConfirm={() => void executeStatusAction()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Level"
        message={`Delete Level ${deleteTarget?.levelNumber || ""} ${deleteTarget?.title ? `(${deleteTarget.title})` : ""}? This removes the course-level entry permanently.`}
        confirmLabel={deleting ? "Deleting..." : "Delete Level"}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
        onConfirm={() => void executeDelete()}
      />
      />
    </section>
  );
}

export { SuperadminCourseLevelsPage };
