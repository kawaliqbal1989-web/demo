import { EmptyState } from "../../../components/EmptyState";
import { SkeletonLine } from "../../../components/SkeletonLoader";
import { BatchActionsMenu } from "./BatchActionsMenu";
import { BatchStatusBadge } from "./BatchStatusBadge";
import { getTeacherNames } from "./batchCatalog.helpers";

function SortableHeader({ label, sortKey, activeSortBy, activeSortDir, onSort }) {
  const isActive = activeSortBy === sortKey;

  return (
    <button type="button" className={`batch-table__sort${isActive ? " is-active" : ""}`} onClick={() => onSort(sortKey)}>
      <span>{label}</span>
      <span>{isActive ? (activeSortDir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function LoadingRows({ compact = false }) {
  return Array.from({ length: compact ? 8 : 6 }, (_, index) => (
    <tr key={index}>
      {Array.from({ length: 6 }, (_, cellIndex) => (
        <td key={cellIndex}><SkeletonLine width={cellIndex === 0 ? "82%" : "60%"} height={12} /></td>
      ))}
    </tr>
  ));
}

function BatchCatalogTable({ items = [], loading = false, compact = false, sortBy, sortDir, onSort, onOpenBatch, onAction }) {
  if (!loading && !items.length) {
    return (
      <div className="card">
        <EmptyState
          icon="📚"
          title="No batches matched this view"
          description="Adjust the search or filters, or create a new batch from the catalog toolbar."
        />
      </div>
    );
  }

  return (
    <div className={`batch-table-wrap card${compact ? " is-compact" : ""}`}>
      <table className="batch-table">
        <thead>
          <tr>
            <th><SortableHeader label="Batch" sortKey="name" activeSortBy={sortBy} activeSortDir={sortDir} onSort={onSort} /></th>
            <th><SortableHeader label="Teacher" sortKey="teacherName" activeSortBy={sortBy} activeSortDir={sortDir} onSort={onSort} /></th>
            <th><SortableHeader label="Level" sortKey="levelRank" activeSortBy={sortBy} activeSortDir={sortDir} onSort={onSort} /></th>
            <th><SortableHeader label="Students" sortKey="studentCount" activeSortBy={sortBy} activeSortDir={sortDir} onSort={onSort} /></th>
            <th><SortableHeader label="Status" sortKey="status" activeSortBy={sortBy} activeSortDir={sortDir} onSort={onSort} /></th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? <LoadingRows compact={compact} /> : null}

          {!loading ? items.map((batch) => {
            const teacherNames = getTeacherNames(batch);
            const statusMeta = [batch.modality, batch.health].filter(Boolean).join(" • ");

            return (
              <tr key={batch.id}>
                <td>
                  <button type="button" className="batch-table__primary" onClick={() => onOpenBatch(batch, "view")}>
                    {batch.name}
                  </button>
                  <div className="batch-table__secondary">{batch.scheduleSummary || "Schedule pending"}</div>
                </td>
                <td>
                  <div className="batch-table__stack">
                    <strong>{teacherNames[0] || "Unassigned"}</strong>
                    <span>{teacherNames.length > 1 ? `+${teacherNames.length - 1} more` : batch.primaryTeacherName || "No primary teacher"}</span>
                  </div>
                </td>
                <td>
                  <div className="batch-table__stack">
                    <strong>{batch.level?.name || "Unmapped"}</strong>
                    <span>{batch.level?.rank ? `Rank ${batch.level.rank}` : "No level rank"}</span>
                  </div>
                </td>
                <td>
                  <div className="batch-table__stack">
                    <strong>{batch.currentStudents || 0}</strong>
                    <span>{batch.maxStudents ? `${batch.maxStudents} cap` : "Open cap"}</span>
                  </div>
                </td>
                <td>
                  <div className="batch-table__stack">
                    <BatchStatusBadge status={batch.status} />
                    <span>{statusMeta || "Mode pending"}</span>
                  </div>
                </td>
                <td>
                  <BatchActionsMenu
                    actions={[
                      { label: "View", onClick: () => onAction("view", batch), hint: "Open drawer" },
                      { label: "Edit", onClick: () => onAction("edit", batch), hint: "Update metadata" },
                      { label: batch.status === "ARCHIVED" ? "Restore" : "Archive", onClick: () => onAction(batch.status === "ARCHIVED" ? "restore" : "archive", batch), hint: "Change status" },
                      { label: "Duplicate", onClick: () => onAction("duplicate", batch), hint: "Clone batch shell" },
                      { label: "Assign teacher", onClick: () => onAction("assign-teacher", batch), hint: "Update staffing" }
                    ]}
                  />
                </td>
              </tr>
            );
          }) : null}
        </tbody>
      </table>
    </div>
  );
}

export { BatchCatalogTable };