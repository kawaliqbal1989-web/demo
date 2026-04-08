import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PageHeader } from "../../components/PageHeader";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { archiveCourse, createCourse, deleteCourse, listCourses, updateCourse } from "../../services/coursesService";

function statusFromCourse(course) {
  return course?.isActive === false ? "INACTIVE" : "ACTIVE";
}

function SuperadminCoursesPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [statusActionTarget, setStatusActionTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    code: "ABACUS_ONLINE",
    name: "",
    status: "ACTIVE",
    description: ""
  });

  const load = async (next = { limit, offset, q, status: statusFilter }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listCourses(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load courses.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, q, status: statusFilter });
  }, []);

  if (loading && !rows.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const resetForm = () => {
    setEditingId(null);
    setFormError("");
    setForm({ code: "ABACUS_ONLINE", name: "", status: "ACTIVE", description: "" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      if (!form.code || !String(form.code).trim()) {
        setFormError("Course code is required.");
        return;
      }

      if (!form.name || !String(form.name).trim()) {
        setFormError("Course name is required.");
        return;
      }

      if (editingId) {
        await updateCourse({
          id: editingId,
          name: form.name,
          status: form.status,
          description: form.description
        });
      } else {
        await createCourse({
          code: form.code,
          name: form.name,
          status: form.status,
          description: form.description
        });
      }

      resetForm();
      setOffset(0);
      await load({ limit, offset: 0, q, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to save course.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (course) => {
    setEditingId(course.id);
    setFormError("");
    setForm({
      code: course.code,
      name: course.name,
      status: statusFromCourse(course),
      description: course.description || ""
    });
  };

  const handleDeactivate = async (course) => {
    setStatusActionTarget({ course, action: "DEACTIVATE" });
  };

  const handleActivate = async (course) => {
    setStatusActionTarget({ course, action: "ACTIVATE" });
  };

  const executeStatusAction = async () => {
    const target = statusActionTarget;
    setStatusActionTarget(null);
    if (!target?.course) {
      return;
    }

    const { course, action } = target;

    try {
      if (action === "ACTIVATE") {
        await updateCourse({ id: course.id, status: "ACTIVE" });
      } else {
        await archiveCourse(course.id);
      }
      await load({ limit, offset, q, status: statusFilter });
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          (action === "ACTIVATE" ? "Failed to activate course." : "Failed to deactivate course.")
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
      await deleteCourse(target.id);
      if (editingId === target.id) {
        resetForm();
      }

      const shouldResetPage = rows.length === 1 && offset > 0;
      const nextOffset = shouldResetPage ? Math.max(0, offset - limit) : offset;
      setOffset(nextOffset);
      await load({ limit, offset: nextOffset, q, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to delete course.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Courses" subtitle="Create and manage Abacus Online courses." />

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Course Code
              <input
                className="input"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Course Name
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
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
            <label>
              Description
              <input
                className="input"
                placeholder="Short description"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </label>
          </div>

          {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
            <button className="button" type="submit" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Course" : "Create Course"}
            </button>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={resetForm} disabled={saving}>
              Reset
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Course List</h3>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Review and edit existing courses.
        </p>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />
          <select
            className="select"
            value={statusFilter}
            onChange={(e) => handleStatusFilterChange(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" style={{ width: "auto" }} onClick={handleRefresh}>
          Refresh
        </button>
      </div>

      <DataTable
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "status", header: "Status", render: (r) => <StatusBadge value={statusFromCourse(r)} /> },
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
                  onClick={() => navigate(`/superadmin/courses/${r.id}/levels`)}
                >
                  Levels
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => void (r?.isActive === true ? handleDeactivate(r) : handleActivate(r))}
                >
                  {r?.isActive === true ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto", color: "var(--color-text-danger)" }}
                  onClick={() => setDeleteTarget(r)}
                  disabled={deleting}
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
          void load({ ...next, q, status: statusFilter });
        }}
      />

      <ConfirmDialog
        open={!!statusActionTarget}
        title={statusActionTarget?.action === "ACTIVATE" ? "Activate Course" : "Deactivate Course"}
        message={`${statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Deactivate"} course "${statusActionTarget?.course?.name || ""}"? ${statusActionTarget?.action === "ACTIVATE" ? "You can deactivate it again later." : "You can activate it again later."}`}
        confirmLabel={statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Deactivate"}
        onCancel={() => setStatusActionTarget(null)}
        onConfirm={() => void executeStatusAction()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Course"
        message={`Delete course "${deleteTarget?.name || ""}" permanently? This removes its course-level setup and cannot be undone.`}
        confirmLabel={deleting ? "Deleting..." : "Delete Course"}
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

export { SuperadminCoursesPage };
