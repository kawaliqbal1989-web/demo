import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getCourse } from "../../services/coursesService";
import { createCourseLevel, listCourseLevels, updateCourseLevel } from "../../services/courseLevelsService";

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

  const handleStatusFilterChange = (nextStatus) => {
    setStatusFilter(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, status: nextStatus });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Course Levels: {course?.name || "Course"}</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage levels 1-15 for the selected course.
        </p>
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
    </section>
  );
}

export { SuperadminCourseLevelsPage };
