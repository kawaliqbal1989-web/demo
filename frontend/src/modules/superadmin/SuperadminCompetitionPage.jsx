import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  createCompetition,
  listCompetitionSeasons,
  listCompetitions
} from "../../services/competitionsService";

function asItems(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function toIso(localValue) {
  const date = new Date(String(localValue || "").trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function SuperadminCompetitionPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [seasons, setSeasons] = useState([]);
  const [resourcesLoading, setResourcesLoading] = useState(true);
  const [resourcesError, setResourcesError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    seasonId: "",
    title: "",
    code: "",
    description: "",
    enrollmentStartAt: "",
    enrollmentEndAt: "",
    startsAt: "",
    endsAt: "",
    status: "DRAFT"
  });

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const response = await listCompetitions(next);
      const items = asItems(response);
      const explicitTotal =
        response?.data?.total ??
        response?.pagination?.total ??
        response?.meta?.total;

      setRows(items);
      setTotal(
        Number.isFinite(Number(explicitTotal))
          ? Number(explicitTotal)
          : next.offset + items.length + (items.length === next.limit ? 1 : 0)
      );
      setLimit(next.limit);
      setOffset(next.offset);
    } catch (err) {
      setError(
        getFriendlyErrorMessage(err) || "Failed to load competitions."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadResources() {
      setResourcesLoading(true);
      setResourcesError("");
      try {
        const seasonsResponse = await listCompetitionSeasons({
          limit: 100,
          offset: 0,
          status: "ACTIVE"
        });

        if (cancelled) return;
        setSeasons(asItems(seasonsResponse));
      } catch (err) {
        if (cancelled) return;
        setResourcesError(
          getFriendlyErrorMessage(err) ||
            "Failed to load Competition Seasons."
        );
      } finally {
        if (!cancelled) setResourcesLoading(false);
      }
    }

    void load({ limit, offset });
    void loadResources();

    return () => {
      cancelled = true;
    };
  }, []);

  const resetCreateForm = () => {
    setForm({
      seasonId: "",
      title: "",
      code: "",
      description: "",
      enrollmentStartAt: "",
      enrollmentEndAt: "",
      startsAt: "",
      endsAt: "",
      status: "DRAFT"
    });
  };

  const handleCreate = async (event) => {
    event.preventDefault();

    const enrollmentStartAt = toIso(form.enrollmentStartAt);
    const enrollmentEndAt = toIso(form.enrollmentEndAt);
    const startsAt = toIso(form.startsAt);
    const endsAt = toIso(form.endsAt);

    if (!form.seasonId) {
      toast.error("Competition Season is required.");
      return;
    }
    if (!String(form.title || "").trim()) {
      toast.error("Competition title is required.");
      return;
    }
    if (!String(form.code || "").trim()) {
      toast.error("Competition code is required.");
      return;
    }
    if (
      !enrollmentStartAt ||
      !enrollmentEndAt ||
      !startsAt ||
      !endsAt
    ) {
      toast.error("Enter all enrollment and Competition dates.");
      return;
    }
    if (new Date(enrollmentEndAt) <= new Date(enrollmentStartAt)) {
      toast.error("Enrollment end must be after enrollment start.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error("Competition end must be after Competition start.");
      return;
    }
    if (new Date(enrollmentEndAt) > new Date(endsAt)) {
      toast.error("Enrollment end must be on or before Competition end.");
      return;
    }
    setCreating(true);
    try {
      const response = await createCompetition({
        seasonId: form.seasonId,
        title: String(form.title).trim(),
        code: String(form.code).trim(),
        description: String(form.description || "").trim() || null,
        enrollmentStartAt,
        enrollmentEndAt,
        startsAt,
        endsAt,
        status: form.status || "DRAFT"
      });

      const created = response?.data || response;
      toast.success("Competition created.");
      setShowCreate(false);
      resetCreateForm();
      if (created?.id) {
        navigate(`/superadmin/competition/${created.id}/pending#overview`);
      } else {
        await load({ limit, offset: 0 });
      }
    } catch (err) {
      toast.error(
        getFriendlyErrorMessage(err) || "Failed to create Competition."
      );
    } finally {
      setCreating(false);
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading competitions..." />;
  }

  const draftCompetitions = rows.filter(
    (row) => String(row?.status || "").toUpperCase() === "DRAFT"
  ).length;
  const scheduledCompetitions = rows.filter(
    (row) => String(row?.status || "").toUpperCase() === "SCHEDULED"
  ).length;
  const activeCompetitions = rows.filter(
    (row) => String(row?.status || "").toUpperCase() === "ACTIVE"
  ).length;
  const completedCompetitions = rows.filter(
    (row) => String(row?.status || "").toUpperCase() === "COMPLETED"
  ).length;
  const archivedCompetitions = rows.filter(
    (row) => String(row?.status || "").toUpperCase() === "ARCHIVED"
  ).length;

  const columns = [
    {
      key: "code",
      header: "Competition Code",
      render: (row) => row?.code || "—"
    },
    {
      key: "title",
      header: "Competition",
      render: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row?.title || "—"}</div>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            {formatDateTime(row?.startsAt)} – {formatDateTime(row?.endsAt)}
          </div>
        </div>
      )
    },
    {
      key: "partners",
      header: "Business Partner Count",
      render: (row) =>
        Number.isFinite(Number(row?.businessPartnerCount))
          ? Number(row.businessPartnerCount)
          : row?.businessPartnerMappings?.length ?? 0
    },
    {
      key: "courses",
      header: "Course Count",
      render: (row) =>
        Number.isFinite(Number(row?.courseCount))
          ? Number(row.courseCount)
          : (row?.courseMappings || []).length
    },
    {
      key: "levels",
      header: "Level Count",
      render: (row) =>
        Number.isFinite(Number(row?.courseLevelCount))
          ? Number(row.courseLevelCount)
          : Array.isArray(row?.courseMappings)
          ? row.courseMappings.reduce(
              (count, course) => count + ((course?.levels || []).length || 0),
              0
            )
          : "-"
    },
    {
      key: "worksheets",
      header: "Worksheet Count",
      render: (row) =>
        Number.isFinite(Number(row?.worksheetCount))
          ? Number(row.worksheetCount)
          : (row?.worksheets || []).length
    },
    {
      key: "enrollments",
      header: "Enrollment Count",
      render: (row) =>
        Number.isFinite(Number(row?.registrationCount))
          ? Number(row.registrationCount)
          : (row?.enrollments || []).length
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row?.status || "DRAFT"} />
    },
    {
      key: "createdBy",
      header: "Created By",
      render: (row) => row?.createdBy?.email || row?.createdByUserId || "-"
    },
    {
      key: "updatedAt",
      header: "Updated At",
      render: (row) => formatDateTime(row?.updatedAt)
    },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Link
            className="button"
            style={{ width: "auto", fontSize: 12 }}
            to={`/superadmin/competition/${row.id}/pending#overview`}
          >
            Open Workspace
          </Link>
        </div>
      )
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Competitions</h2>
          <div
            style={{ fontSize: 12, color: "var(--color-text-muted)" }}
          >
            Create Competition events and configure them later in Workspace
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => void load({ limit, offset })}
          >
            Refresh
          </button>
          <button
            className="button"
            type="button"
            style={{ width: "auto" }}
            onClick={() => setShowCreate((value) => !value)}
          >
            {showCreate ? "Cancel" : "+ New Competition"}
          </button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10
        }}
      >
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Draft Competitions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {draftCompetitions}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Scheduled Competitions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {scheduledCompetitions}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Active Competitions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {activeCompetitions}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Completed Competitions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {completedCompetitions}
          </div>
        </div>
        <div className="card">
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Archived Competitions
          </div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>
            {archivedCompetitions}
          </div>
        </div>
      </div>

      <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => setShowCreate(true)}
        >
          Quick Action: New Competition
        </button>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => void load({ limit, offset })}
        >
          Quick Action: Refresh Dashboard
        </button>
      </div>

      {showCreate ? (
        <form
          className="card"
          onSubmit={handleCreate}
          style={{ display: "grid", gap: 16 }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Create Competition</h3>
            <div
              style={{ fontSize: 12, color: "var(--color-text-muted)" }}
            >
              Create the Competition event. Academic content is configured later in Workspace.
            </div>
          </div>

          {resourcesLoading ? (
            <LoadingState label="Loading setup options..." />
          ) : null}
          {resourcesError ? (
            <p className="error" style={{ margin: 0 }}>
              {resourcesError}
            </p>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              Season
              <select
                className="select"
                value={form.seasonId}
                required
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    seasonId: event.target.value
                  }))
                }
              >
                <option value="">Select Competition Season</option>
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.code ? `${season.code} — ` : ""}{season.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Competition Name
              <input
                className="input"
                value={form.title}
                maxLength={200}
                required
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    title: event.target.value
                  }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Competition Code
              <input
                className="input"
                value={form.code}
                maxLength={100}
                required
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    code: event.target.value
                  }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Status
              <select
                className="select"
                value={form.status}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    status: event.target.value
                  }))
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Description
              <input
                className="input"
                value={form.description}
                maxLength={2000}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    description: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 12
            }}
          >
            <label style={{ display: "grid", gap: 6 }}>
              Enrollment starts
              <input
                className="input"
                type="datetime-local"
                value={form.enrollmentStartAt}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    enrollmentStartAt: event.target.value
                  }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Enrollment ends
              <input
                className="input"
                type="datetime-local"
                value={form.enrollmentEndAt}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    enrollmentEndAt: event.target.value
                  }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Competition starts
              <input
                className="input"
                type="datetime-local"
                value={form.startsAt}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    startsAt: event.target.value
                  }))
                }
              />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              Competition ends
              <input
                className="input"
                type="datetime-local"
                value={form.endsAt}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    endsAt: event.target.value
                  }))
                }
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="button"
              type="submit"
              style={{ width: "auto" }}
              disabled={creating || resourcesLoading}
            >
              {creating ? "Creating..." : "Create Competition"}
            </button>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              disabled={creating}
              onClick={() => {
                resetCreateForm();
                setShowCreate(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      <DataTable columns={columns} rows={rows} keyField="id" />
      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset });
        }}
      />
    </div>
  );
}

export { SuperadminCompetitionPage };
