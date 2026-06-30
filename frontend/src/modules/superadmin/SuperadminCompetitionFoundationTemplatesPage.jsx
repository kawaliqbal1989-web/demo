import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { StatusBadge } from "../../components/StatusBadge";
import { useAuth } from "../../hooks/useAuth";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  archiveCompetitionFoundationTemplate,
  createCompetitionFoundationTemplate,
  deleteCompetitionFoundationTemplate,
  listCompetitionFoundationTemplates,
  updateCompetitionFoundationTemplate
} from "../../services/competitionFoundationService";
import { CompetitionModuleNav } from "./CompetitionModuleNav";

const DEFAULT_PAGE_SIZE = 10;

function normalizeTemplatesResponse(payload) {
  if (Array.isArray(payload?.data?.items)) {
    return payload.data.items;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.items)) {
    return payload.items;
  }
  return [];
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    return String(value);
  }
  return d.toLocaleString();
}

function SuperadminCompetitionFoundationTemplatesPage() {
  const { role, capabilities } = useAuth();
  const canViewTemplates = role === "SUPERADMIN" && (capabilities ? Boolean(capabilities?.canManageCompetitionFoundation ?? capabilities?.canManageCompetition ?? true) : true);
  const canMutateTemplates = canViewTemplates && (capabilities ? Boolean(capabilities?.canManageCompetitionFoundation ?? capabilities?.canManageCompetition ?? true) : true);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [offset, setOffset] = useState(0);

  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filteredRows = useMemo(() => {
    const normalizedQuery = String(query || "").trim().toLowerCase();

    return rows.filter((row) => {
      if (!showArchived && row?.isActive === false) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [row?.name, row?.slug, row?.description].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
    });
  }, [rows, query, showArchived]);

  const pagedRows = useMemo(() => {
    return filteredRows.slice(offset, offset + limit);
  }, [filteredRows, offset, limit]);

  const resetForm = () => {
    setEditingTemplateId("");
    setName("");
    setSlug("");
    setDescription("");
    setIsActive(true);
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const payload = await listCompetitionFoundationTemplates({ includeInactive: true });
      const list = normalizeTemplatesResponse(payload);
      setRows(list);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition templates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewTemplates) {
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewTemplates]);

  useEffect(() => {
    setOffset(0);
  }, [query, showArchived]);

  const beginEdit = (row) => {
    setEditingTemplateId(row?.id || "");
    setName(String(row?.name || ""));
    setSlug(String(row?.slug || ""));
    setDescription(String(row?.description || ""));
    setIsActive(row?.isActive !== false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canMutateTemplates) {
      toast.error("You do not have permission to manage templates.");
      return;
    }

    const payload = {
      name: String(name || "").trim(),
      slug: String(slug || "").trim(),
      description: String(description || "").trim() || null,
      isActive
    };

    if (!payload.name || !payload.slug) {
      toast.error("Template name and slug are required.");
      return;
    }

    setSaving(true);
    try {
      if (editingTemplateId) {
        await updateCompetitionFoundationTemplate(editingTemplateId, payload);
        toast.success("Template updated.");
      } else {
        await createCompetitionFoundationTemplate(payload);
        toast.success("Template created.");
      }
      resetForm();
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to save template.");
    } finally {
      setSaving(false);
    }
  };

  const executeArchive = async () => {
    const target = archiveTarget;
    setArchiveTarget(null);
    if (!target?.id) {
      return;
    }

    try {
      await archiveCompetitionFoundationTemplate(target.id);
      toast.success("Template archived.");
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to archive template.");
    }
  };

  const executeDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target?.id) {
      return;
    }

    try {
      await deleteCompetitionFoundationTemplate(target.id);
      toast.success("Template deleted.");
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to delete template.");
    }
  };

  if (!canViewTemplates) {
    return <ErrorState title="Access restricted" message="Competition Foundation Templates are not available for your account." />;
  }

  if (loading && !rows.length) {
    return <LoadingState label="Loading competition templates..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <CompetitionModuleNav />

      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h2 style={{ margin: 0 }}>Foundation Templates</h2>
          <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
            Create and govern reusable competition templates.
          </p>
        </div>
        <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error ? (
        <ErrorState
          title="Failed to load"
          message={error}
          onRetry={() => void load()}
        />
      ) : null}

      <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={handleSubmit}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Template Name</span>
            <input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Level 1 Sprint Template" disabled={!canMutateTemplates || saving} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Slug</span>
            <input className="input" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="level-1-sprint-template" disabled={!canMutateTemplates || saving} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Status</span>
            <select className="select" value={isActive ? "ACTIVE" : "ARCHIVED"} onChange={(event) => setIsActive(event.target.value === "ACTIVE")} disabled={!canMutateTemplates || saving}>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Description</span>
          <textarea className="input" rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Reusable blueprint for foundation competition creation" disabled={!canMutateTemplates || saving} />
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" style={{ width: "auto" }} type="submit" disabled={!canMutateTemplates || saving}>
            {saving ? "Saving..." : editingTemplateId ? "Update Template" : "Create Template"}
          </button>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={resetForm} disabled={saving}>
            Reset
          </button>
        </div>
      </form>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search</span>
            <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, slug, or description" />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Visibility</span>
            <select className="select" value={showArchived ? "ALL" : "ACTIVE"} onChange={(event) => setShowArchived(event.target.value === "ALL")}>
              <option value="ACTIVE">Active only</option>
              <option value="ALL">Include archived</option>
            </select>
          </label>
        </div>
      </div>

      {!filteredRows.length ? (
        <EmptyState
          icon=""
          title={query ? "No templates match this search" : "No templates yet"}
          description={query ? "Try a different search term or clear filters." : "Create your first competition foundation template to begin."}
          action={!query && canMutateTemplates ? { label: "Create Template", onClick: () => resetForm() } : null}
        />
      ) : (
        <>
          <DataTable
            columns={[
              { key: "name", header: "Template" },
              { key: "slug", header: "Slug" },
              { key: "description", header: "Description", render: (row) => row?.description || "-", wrap: true },
              {
                key: "status",
                header: "Status",
                render: (row) => <StatusBadge status={row?.isActive === false ? "ARCHIVED" : "ACTIVE"} />
              },
              { key: "updatedAt", header: "Updated", render: (row) => formatDateTime(row?.updatedAt || row?.createdAt) },
              {
                key: "actions",
                header: "Actions",
                render: (row) => (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="button secondary" style={{ width: "auto", fontSize: 12 }} type="button" onClick={() => beginEdit(row)} disabled={!canMutateTemplates}>
                      Edit
                    </button>
                    <button
                      className="button secondary"
                      style={{ width: "auto", fontSize: 12 }}
                      type="button"
                      onClick={() => setArchiveTarget(row)}
                      disabled={!canMutateTemplates || row?.isActive === false}
                    >
                      Archive
                    </button>
                    <button className="button secondary" style={{ width: "auto", fontSize: 12 }} type="button" onClick={() => setDeleteTarget(row)} disabled={!canMutateTemplates}>
                      Delete
                    </button>
                  </div>
                )
              }
            ]}
            rows={pagedRows}
            keyField="id"
          />

          <PaginationBar
            limit={limit}
            offset={offset}
            count={pagedRows.length}
            total={filteredRows.length}
            onChange={(next) => {
              setLimit(next.limit);
              setOffset(next.offset);
            }}
          />
        </>
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        title="Archive Template"
        message={`Archive template \"${archiveTarget?.name || ""}\"?`}
        confirmLabel="Archive"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={() => void executeArchive()}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Template"
        message={`Delete template \"${deleteTarget?.name || ""}\"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void executeDelete()}
      />
    </section>
  );
}

export { SuperadminCompetitionFoundationTemplatesPage };
