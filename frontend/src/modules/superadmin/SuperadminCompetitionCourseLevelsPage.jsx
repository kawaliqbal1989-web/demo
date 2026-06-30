import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  createCompetitionCourseLevel,
  getCompetitionCourse,
  listCompetitionCourseLevels,
  updateCompetitionCourseLevel
} from "../../services/competitionCoursesService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { CompetitionModuleNav } from "./CompetitionModuleNav";

function statusFromLevel(level) {
  return level?.isActive === false ? "INACTIVE" : "ACTIVE";
}

function nextLevelNumber(rows) {
  const used = new Set(rows.map((row) => Number(row.levelNumber)).filter((value) => Number.isInteger(value) && value > 0));
  let next = 1;
  while (used.has(next)) next += 1;
  return next;
}

function SuperadminCompetitionCourseLevelsPage() {
  const { courseId } = useParams();
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
  const [form, setForm] = useState({
    levelNumber: "1",
    title: "",
    sortOrder: "1",
    status: "ACTIVE"
  });

  const suggestedLevelNumber = useMemo(() => nextLevelNumber(rows), [rows]);

  const loadCourse = async () => {
    setLoadingCourse(true);
    try {
      const payload = await getCompetitionCourse(courseId);
      setCourse(payload?.data || null);
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
      const payload = await listCompetitionCourseLevels({ courseId, ...next });
      const items = payload.data.items || [];
      setRows(items);
      setLimit(payload.data.limit);
      setOffset(payload.data.offset);
      if (!editingId) {
        const nextNumber = nextLevelNumber(items);
        setForm((prev) => ({ ...prev, levelNumber: String(nextNumber), sortOrder: String(nextNumber) }));
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition course levels.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCourse();
    void load({ limit, offset, status: statusFilter });
  }, []);

  if (loadingCourse) {
    return <LoadingState label="Loading competition course..." />;
  }

  const resetForm = () => {
    setEditingId(null);
    setFormError("");
    setForm({
      levelNumber: String(suggestedLevelNumber),
      title: "",
      sortOrder: String(suggestedLevelNumber),
      status: "ACTIVE"
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      const levelNumber = Number(form.levelNumber);
      const sortOrder = Number(form.sortOrder);

      if (!Number.isInteger(levelNumber) || levelNumber < 1) {
        setFormError("Level Number must be a positive integer.");
        return;
      }

      if (!String(form.title || "").trim()) {
        setFormError("Title is required.");
        return;
      }

      if (!Number.isInteger(sortOrder)) {
        setFormError("Sort Order must be an integer.");
        return;
      }

      const payload = {
        courseId,
        title: form.title,
        sortOrder,
        status: form.status === "INACTIVE" ? "ARCHIVED" : form.status
      };

      if (editingId) {
        await updateCompetitionCourseLevel({ id: editingId, ...payload });
      } else {
        await createCompetitionCourseLevel({ levelNumber, ...payload });
      }

      setEditingId(null);
      setOffset(0);
      await load({ limit, offset: 0, status: statusFilter });
      setFormError("");
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to save competition course level.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (level) => {
    setEditingId(level.id);
    setFormError("");
    setForm({
      levelNumber: String(level.levelNumber),
      title: level.title || "",
      sortOrder: String(level.sortOrder),
      status: statusFromLevel(level)
    });
  };

  const handleStatusFilterChange = (nextStatus) => {
    setStatusFilter(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, status: nextStatus });
  };

  const executeStatusAction = async () => {
    const target = statusActionTarget;
    setStatusActionTarget(null);
    if (!target?.level) return;

    try {
      await updateCompetitionCourseLevel({
        courseId,
        id: target.level.id,
        status: target.action === "ACTIVATE" ? "ACTIVE" : "ARCHIVED"
      });
      if (editingId === target.level.id) {
        setForm((prev) => ({ ...prev, status: target.action === "ACTIVATE" ? "ACTIVE" : "INACTIVE" }));
      }
      await load({ limit, offset, status: statusFilter });
    } catch (err) {
      setFormError(
        getFriendlyErrorMessage(err) ||
          (target.action === "ACTIVATE" ? "Failed to activate level." : "Failed to deactivate level.")
      );
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <CompetitionModuleNav />

      <div>
        <h2 style={{ margin: 0 }}>Competition Course Levels: {course?.name || "Competition Course"}</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage reusable levels for this competition course.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate("/superadmin/competition/courses")}
        >
          Back to Competition Courses
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
                onChange={(event) => setForm((prev) => ({ ...prev, levelNumber: event.target.value }))}
                disabled={Boolean(editingId)}
              />
            </label>
            <label>
              Title
              <input
                className="input"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </label>
            <label>
              Sort Order
              <input
                className="input"
                inputMode="numeric"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </label>
            <label>
              Status
              <select
                className="select"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
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
        <h3 style={{ margin: 0 }}>Levels</h3>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="select"
          value={statusFilter}
          onChange={(event) => handleStatusFilterChange(event.target.value)}
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
          { key: "description", header: "Description", render: (row) => row.description || "-" },
          { key: "status", header: "Status", render: (row) => <StatusBadge value={statusFromLevel(row)} /> },
          {
            key: "actions",
            header: "Actions",
            render: (row) => (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => handleEdit(row)}>
                  Edit
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/competition/courses/${courseId}/levels/${row.id}/question-bank`)}
                >
                  Question Bank
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/superadmin/competition/courses/${courseId}/levels/${row.id}/worksheets`)}
                >
                  Worksheets
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => setStatusActionTarget({ level: row, action: row?.isActive === true ? "DEACTIVATE" : "ACTIVATE" })}
                >
                  {row?.isActive === true ? "Deactivate" : "Activate"}
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
    </section>
  );
}

export { SuperadminCompetitionCourseLevelsPage };
