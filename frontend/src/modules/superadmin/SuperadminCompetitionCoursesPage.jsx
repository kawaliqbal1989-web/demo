import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { PageHeader } from "../../components/PageHeader";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { StatusBadge } from "../../components/StatusBadge";
import {
  archiveCompetitionCourse,
  createCompetitionCourse,
  listCompetitionCourses,
  updateCompetitionCourse
} from "../../services/competitionCoursesService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { CompetitionModuleNav } from "./CompetitionModuleNav";

function statusFromCourse(course) {
  return course?.isActive === false ? "INACTIVE" : "ACTIVE";
}

function apiStatusFromUi(status) {
  return status === "INACTIVE" ? "ARCHIVED" : status;
}

function SuperadminCompetitionCoursesPage() {
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
  const [form, setForm] = useState({
    code: "",
    name: "",
    status: "ACTIVE",
    description: ""
  });

  const load = async (next = { limit, offset, q, status: statusFilter }) => {
    setLoading(true);
    setError("");
    try {
      const payload = await listCompetitionCourses(next);
      setRows(payload.data.items || []);
      setLimit(payload.data.limit);
      setOffset(payload.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition courses.");
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
    setForm({ code: "", name: "", status: "ACTIVE", description: "" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");

    try {
      if (!String(form.code || "").trim()) {
        setFormError("Competition Course code is required.");
        return;
      }

      if (!String(form.name || "").trim()) {
        setFormError("Competition Course name is required.");
        return;
      }

      const payload = {
        code: form.code,
        name: form.name,
        status: apiStatusFromUi(form.status),
        description: form.description
      };

      if (editingId) {
        await updateCompetitionCourse({ id: editingId, ...payload });
      } else {
        await createCompetitionCourse(payload);
      }

      resetForm();
      setOffset(0);
      await load({ limit, offset: 0, q, status: statusFilter });
    } catch (err) {
      setFormError(getFriendlyErrorMessage(err) || "Failed to save competition course.");
    } finally {
      setSaving(false);
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

  const handleEdit = (course) => {
    setEditingId(course.id);
    setFormError("");
    setForm({
      code: course.code || "",
      name: course.name || "",
      status: statusFromCourse(course),
      description: course.description || ""
    });
  };

  const executeStatusAction = async () => {
    const target = statusActionTarget;
    setStatusActionTarget(null);
    if (!target?.course) return;

    try {
      if (target.action === "ACTIVATE") {
        await updateCompetitionCourse({ id: target.course.id, status: "ACTIVE" });
      } else {
        await archiveCompetitionCourse(target.course.id);
      }
      await load({ limit, offset, q, status: statusFilter });
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) ||
          (target.action === "ACTIVATE" ? "Failed to activate competition course." : "Failed to archive competition course.")
      );
    }
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <CompetitionModuleNav />
      <PageHeader title="Competition Courses" subtitle="Create reusable course structures for competitions." />

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Competition Course Code
              <input
                className="input"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            </label>
            <label>
              Competition Course Name
              <input
                className="input"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
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
            <label>
              Description
              <input
                className="input"
                placeholder="Short description"
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
          </div>

          {formError ? <p className="error" style={{ margin: 0 }}>{formError}</p> : null}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-start" }}>
            <button className="button" type="submit" style={{ width: "auto" }} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Competition Course" : "Create Competition Course"}
            </button>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={resetForm} disabled={saving}>
              Reset
            </button>
          </div>
        </form>
      </div>

      <div>
        <h3 style={{ margin: 0 }}>Competition Course List</h3>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage reusable competition course levels.
        </p>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            style={{ width: 280 }}
          />
          <select
            className="select"
            value={statusFilter}
            onChange={(event) => handleStatusFilterChange(event.target.value)}
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
        <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void load({ limit, offset, q, status: statusFilter })}>
          Refresh
        </button>
      </div>

      <DataTable
        columns={[
          { key: "code", header: "Code" },
          { key: "name", header: "Name" },
          { key: "description", header: "Description", render: (row) => row.description || "-" },
          { key: "levelCount", header: "Levels", render: (row) => row?._count?.levels ?? "-" },
          { key: "status", header: "Status", render: (row) => <StatusBadge value={statusFromCourse(row)} /> },
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
                  onClick={() => navigate(`/superadmin/competition/courses/${row.id}/levels`)}
                >
                  Levels
                </button>
                <button
                  className="button secondary"
                  type="button"
                  style={{ width: "auto" }}
                  onClick={() => setStatusActionTarget({ course: row, action: row?.isActive === true ? "ARCHIVE" : "ACTIVATE" })}
                >
                  {row?.isActive === true ? "Archive" : "Activate"}
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
        title={statusActionTarget?.action === "ACTIVATE" ? "Activate Competition Course" : "Archive Competition Course"}
        message={`${statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Archive"} competition course "${statusActionTarget?.course?.name || ""}"?`}
        confirmLabel={statusActionTarget?.action === "ACTIVATE" ? "Activate" : "Archive"}
        onCancel={() => setStatusActionTarget(null)}
        onConfirm={() => void executeStatusAction()}
      />
    </section>
  );
}

export { SuperadminCompetitionCoursesPage };
