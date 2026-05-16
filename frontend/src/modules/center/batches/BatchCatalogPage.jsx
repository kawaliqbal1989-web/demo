import { useMemo, useState } from "react";
import { PaginationBar } from "../../../components/DataTable";
import { ErrorState } from "../../../components/ErrorState";
import { PageHeader } from "../../../components/PageHeader";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { ConfirmDialog } from "../../../components/ConfirmDialog";
import { archiveBatch, createBatch, duplicateBatch, restoreBatch, setBatchTeachers, updateBatch } from "../../../services/batchesService";
import { getFriendlyErrorMessage } from "../../../utils/apiErrors";
import { BatchCatalogTable } from "./BatchCatalogTable";
import { BatchCatalogToolbar } from "./BatchCatalogToolbar";
import { BatchDetailDrawer } from "./BatchDetailDrawer";
import { BatchFilterSidebar } from "./BatchFilterSidebar";
import { BatchSummaryCards } from "./BatchSummaryCards";
import { buildBatchPayload, buildDuplicatePayload } from "./batchCatalog.helpers";
import { useBatchCatalog } from "./useBatchCatalog";
import "./batch-catalog.css";

function extractCreatedBatchId(response) {
  return response?.data?.id || response?.id || null;
}

function BatchCatalogPage() {
  const {
    query,
    searchInput,
    setSearchInput,
    items,
    total,
    loading,
    refreshing,
    error,
    teachers,
    levels,
    lookupsLoading,
    activeFilterCount,
    updateQuery,
    toggleStatus,
    setPage,
    setPageSize,
    setSort,
    clearFilters,
    refresh
  } = useBatchCatalog();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [drawerState, setDrawerState] = useState({ open: false, mode: "view", batch: null });
  const [confirmState, setConfirmState] = useState({ open: false, title: "", message: "", action: null, danger: false, confirmLabel: "Confirm" });
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const currentPage = query.page;
  const pageCount = Math.max(1, Math.ceil(Math.max(total, 1) / query.pageSize));
  const combinedError = actionError || error;
  const hasBlockingLoad = loading && lookupsLoading && !items.length;

  const titleActions = useMemo(() => (
    <button className="button" type="button" onClick={() => setDrawerState({ open: true, mode: "create", batch: null })}>
      New Batch
    </button>
  ), []);

  async function handleDrawerSubmit(formState) {
    setSaving(true);
    setActionError("");

    try {
      const payload = buildBatchPayload(formState);
      const teacherUserIds = formState.teacherUserIds || [];

      if (drawerState.mode === "create") {
        const created = await createBatch(payload);
        const createdBatchId = extractCreatedBatchId(created);
        if (createdBatchId && teacherUserIds.length) {
          await setBatchTeachers(createdBatchId, teacherUserIds);
        }
      } else if (drawerState.batch?.id) {
        await updateBatch(drawerState.batch.id, payload);
        await setBatchTeachers(drawerState.batch.id, teacherUserIds);
      }

      setDrawerState({ open: false, mode: "view", batch: null });
      refresh();
    } catch (submitError) {
      setActionError(getFriendlyErrorMessage(submitError) || "Failed to save batch.");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAction(type, batch) {
    setActionError("");

    if (type === "view") {
      setDrawerState({ open: true, mode: "view", batch });
      return;
    }

    if (type === "edit" || type === "assign-teacher") {
      setDrawerState({ open: true, mode: type, batch });
      return;
    }

    if (type === "duplicate") {
      setSaving(true);
      try {
        const payload = buildDuplicatePayload(batch);
        await duplicateBatch(payload);
        refresh();
      } catch (duplicateError) {
        setActionError(getFriendlyErrorMessage(duplicateError) || "Failed to duplicate batch.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (type === "archive" || type === "restore") {
      const isArchive = type === "archive";
      setConfirmState({
        open: true,
        title: isArchive ? "Archive batch" : "Restore batch",
        message: isArchive
          ? `Archive ${batch.name}? The batch will remain queryable when archived filters are enabled.`
          : `Restore ${batch.name} to active operations?`,
        confirmLabel: isArchive ? "Archive" : "Restore",
        danger: isArchive,
        action: async () => {
          setSaving(true);
          try {
            if (isArchive) {
              await archiveBatch(batch.id);
            } else {
              await restoreBatch(batch.id);
            }
            refresh();
          } catch (confirmError) {
            setActionError(getFriendlyErrorMessage(confirmError) || "Failed to update batch status.");
          } finally {
            setSaving(false);
            setConfirmState((current) => ({ ...current, open: false, action: null }));
          }
        }
      });
    }
  }

  if (hasBlockingLoad) {
    return (
      <section style={{ display: "grid", gap: 16 }}>
        <SkeletonLoader count={4} />
        <SkeletonLoader variant="table" rows={7} cols={10} />
      </section>
    );
  }

  return (
    <section className={`batch-catalog-page${query.compact ? " is-compact" : ""}`}>
      <div className="batch-catalog-page__top">
        <PageHeader
          title="Batch Management"
          subtitle="Operational catalog for staffing, capacity, and center batch flow."
          actions={titleActions}
        />

        {combinedError ? (
          <ErrorState
            title="Batch catalog issue"
            message={combinedError}
            onRetry={() => {
              setActionError("");
              refresh();
            }}
            retryLabel="Reload catalog"
          />
        ) : null}

        <BatchSummaryCards items={items} total={total} refreshing={refreshing} />
      </div>

      <div className="batch-catalog-layout">
        <BatchFilterSidebar
          open={filtersOpen}
          teachers={teachers}
          levels={levels}
          query={query}
          activeFilterCount={activeFilterCount}
          onClose={() => setFiltersOpen(false)}
          onQueryChange={updateQuery}
          onToggleStatus={toggleStatus}
          onClearFilters={() => {
            clearFilters();
            setFiltersOpen(false);
          }}
        />

        <div className="batch-catalog-main">
          <BatchCatalogToolbar
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            page={query.page}
            pageSize={query.pageSize}
            total={total}
            count={items.length}
            compact={query.compact}
            activeFilterCount={activeFilterCount}
            refreshing={refreshing}
            onPageSizeChange={setPageSize}
            onToggleCompact={() => updateQuery({ compact: query.compact ? null : "1" }, { resetPage: false })}
            onOpenFilters={() => setFiltersOpen(true)}
            onRefresh={refresh}
            onCreate={() => setDrawerState({ open: true, mode: "create", batch: null })}
          />

          <BatchCatalogTable
            items={items}
            loading={loading}
            compact={query.compact}
            sortBy={query.sortBy}
            sortDir={query.sortDir}
            onSort={setSort}
            onOpenBatch={(batch, mode = "view") => setDrawerState({ open: true, mode, batch })}
            onAction={handleQuickAction}
          />

          <div className="batch-pagination card">
            <div className="batch-pagination__meta">
              <strong>Page {currentPage}</strong>
              <span>{total} total results across {pageCount} pages</span>
            </div>
            <PaginationBar
              limit={query.pageSize}
              offset={(query.page - 1) * query.pageSize}
              count={items.length}
              total={total}
              onChange={({ limit, offset }) => {
                if (limit !== query.pageSize) {
                  setPageSize(limit);
                  return;
                }
                setPage(Math.floor(offset / query.pageSize) + 1);
              }}
            />
          </div>
        </div>
      </div>

      <BatchDetailDrawer
        open={drawerState.open}
        mode={drawerState.mode}
        batch={drawerState.batch}
        teachers={teachers}
        levels={levels}
        saving={saving}
        onClose={() => setDrawerState({ open: false, mode: "view", batch: null })}
        onSubmit={handleDrawerSubmit}
        onEditMode={() => setDrawerState((current) => ({ ...current, mode: "edit" }))}
      />

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        danger={confirmState.danger}
        onCancel={() => setConfirmState((current) => ({ ...current, open: false, action: null }))}
        onConfirm={() => confirmState.action?.()}
      />
    </section>
  );
}

export { BatchCatalogPage };