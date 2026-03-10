import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { archiveCourse, createCourse, listCourses, updateCourse } from "../../services/coursesService";

function statusFromCourse(course) {
  return course?.isActive === false ? "ARCHIVED" : "ACTIVE";
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
  const [archiveTarget, setArchiveTarget] = useState(null);
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
    return <LoadingState label="Loading courses..." />;
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

  const handleArchive = async (course) => {
    setArchiveTarget(course);
  };

  const executeArchive = async () => {
    const course = archiveTarget;
    setArchiveTarget(null);
    try {
      await archiveCourse(course.id);
      await load({ limit, offset, q, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to archive course.");
    }
  };

  const handleSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status: statusFilter });
  };

  const handleStatusFilterChange = (nextStatus) => {
    setStatusFilter(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, q, status: nextStatus });
  };

  const handleRefresh = () => {
    void load({ limit, offset, q, status: statusFilter });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Courses</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Create and manage Abacus Online courses.
        </p>
      </div>

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
                <option value="ARCHIVED">ARCHIVED</option>
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
            <option value="ARCHIVED">ARCHIVED</option>
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
              <div style={{ display: "flex", gap: 8 }}>
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
                  onClick={() => void handleArchive(r)}
                  disabled={r?.isActive === false}
                >
                  Archive
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
        open={!!archiveTarget}
        title="Archive Course"
        message={`Archive course "${archiveTarget?.name || ""}"? This cannot be undone.`}
        confirmLabel="Archive"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void executeArchive()}
      />
    </section>
  );
}

export { SuperadminCoursesPage };
