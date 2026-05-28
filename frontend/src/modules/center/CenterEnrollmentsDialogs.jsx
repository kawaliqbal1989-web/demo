import { ConfirmDialog } from "../../components/ConfirmDialog";

function CenterEnrollmentsDialogs({
  unenrollTarget,
  onCancelUnenroll,
  onConfirmUnenroll,
  bulkUnenrollTargets,
  bulkUnenrolling,
  onCancelBulkUnenroll,
  onConfirmBulkUnenroll,
  bulkUpdateTargets,
  bulkActionMode,
  bulkUpdating,
  bulkStatus,
  selectedBulkTeacherLabel,
  onCancelBulkUpdate,
  onConfirmBulkUpdate
}) {
  const bulkUpdateMessage = bulkActionMode === "clear"
    ? (bulkStatus
      ? `Clear assigned teacher and set status to ${bulkStatus} for ${bulkUpdateTargets.length} selected enrollment${bulkUpdateTargets.length > 1 ? "s" : ""}?`
      : `Clear assigned teacher for ${bulkUpdateTargets.length} selected enrollment${bulkUpdateTargets.length > 1 ? "s" : ""}?`)
    : (bulkStatus && selectedBulkTeacherLabel !== "selected teacher"
      ? `Assign ${selectedBulkTeacherLabel} and set status to ${bulkStatus} for ${bulkUpdateTargets.length} selected enrollment${bulkUpdateTargets.length > 1 ? "s" : ""}?`
      : bulkStatus
        ? `Set status to ${bulkStatus} for ${bulkUpdateTargets.length} selected enrollment${bulkUpdateTargets.length > 1 ? "s" : ""}?`
        : `Assign ${selectedBulkTeacherLabel} to ${bulkUpdateTargets.length} selected enrollment${bulkUpdateTargets.length > 1 ? "s" : ""}?`);

  const bulkUpdateConfirmLabel = bulkActionMode === "clear" && !bulkStatus
    ? (bulkUpdating ? "Clearing..." : "Clear Teacher")
    : (bulkUpdating ? "Applying..." : "Apply Updates");

  return (
    <>
      <ConfirmDialog
        open={!!unenrollTarget}
        title="Unenroll Student"
        message={`Unenroll ${unenrollTarget?.student?.admissionNo || "student"} from this batch?`}
        confirmLabel="Unenroll"
        onConfirm={onConfirmUnenroll}
        onCancel={onCancelUnenroll}
      />

      <ConfirmDialog
        open={bulkUnenrollTargets.length > 0}
        title="Bulk Unenroll Students"
        message={`Unenroll ${bulkUnenrollTargets.length} selected student${bulkUnenrollTargets.length > 1 ? "s" : ""} from this batch?`}
        confirmLabel={bulkUnenrolling ? "Unenrolling..." : "Unenroll Selected"}
        onConfirm={onConfirmBulkUnenroll}
        onCancel={onCancelBulkUnenroll}
      />

      <ConfirmDialog
        open={bulkUpdateTargets.length > 0}
        title={bulkActionMode === "clear" ? "Bulk Clear Teacher" : "Bulk Apply Updates"}
        message={bulkUpdateMessage}
        confirmLabel={bulkUpdateConfirmLabel}
        onConfirm={onConfirmBulkUpdate}
        onCancel={onCancelBulkUpdate}
      />
    </>
  );
}

export { CenterEnrollmentsDialogs };