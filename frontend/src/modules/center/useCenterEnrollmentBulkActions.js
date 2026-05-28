import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { bulkUpdateEnrollments, updateEnrollment } from "../../services/enrollmentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function useCenterEnrollmentBulkActions({ rows, teacherOptions, batchId, rosterPage, loadEnrollments }) {
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState([]);
  const [bulkTeacherUserId, setBulkTeacherUserId] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkUpdateTargets, setBulkUpdateTargets] = useState([]);
  const [bulkActionMode, setBulkActionMode] = useState("update");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUnenrollTargets, setBulkUnenrollTargets] = useState([]);
  const [bulkUnenrolling, setBulkUnenrolling] = useState(false);
  const [unenrollTarget, setUnenrollTarget] = useState(null);

  useEffect(() => {
    setSelectedEnrollmentIds((current) => current.filter((id) => rows.some((row) => row.id === id)));
  }, [rows]);

  const selectedEnrollmentRows = useMemo(
    () => rows.filter((row) => selectedEnrollmentIds.includes(row.id)),
    [rows, selectedEnrollmentIds]
  );

  const selectedActiveEnrollmentRows = useMemo(
    () => selectedEnrollmentRows.filter((row) => row?.status === "ACTIVE"),
    [selectedEnrollmentRows]
  );

  const selectedRowsWithTeacher = useMemo(
    () => selectedEnrollmentRows.filter((row) => row?.assignedTeacherUserId || row?.assignedTeacher?.id),
    [selectedEnrollmentRows]
  );

  const bulkTeacherDropdownOptions = useMemo(
    () => teacherOptions.map((teacher) => ({
      value: teacher.id,
      label: teacher?.teacherProfile?.fullName || teacher.username || teacher.email || "Teacher"
    })),
    [teacherOptions]
  );

  const selectedBulkTeacher = useMemo(
    () => teacherOptions.find((teacher) => teacher.id === bulkTeacherUserId) || null,
    [teacherOptions, bulkTeacherUserId]
  );

  const selectedBulkTeacherLabel = selectedBulkTeacher?.teacherProfile?.fullName
    || selectedBulkTeacher?.username
    || selectedBulkTeacher?.email
    || "selected teacher";

  const hasBulkUpdateDraft = Boolean(bulkTeacherUserId || bulkStatus);

  const onRequestUnenroll = (row) => {
    setUnenrollTarget(row);
  };

  const onCancelUnenroll = () => {
    setUnenrollTarget(null);
  };

  const onConfirmUnenroll = async () => {
    const row = unenrollTarget;
    setUnenrollTarget(null);
    if (!row) return;

    try {
      await updateEnrollment(row.id, { status: "INACTIVE" });
      setSelectedEnrollmentIds((current) => current.filter((id) => id !== row.id));
      await loadEnrollments(batchId, rosterPage);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to unenroll");
    }
  };

  const onRequestBulkUnenroll = () => {
    if (!selectedActiveEnrollmentRows.length) {
      toast.error("Select at least one active enrollment.");
      return;
    }

    setBulkUnenrollTargets(selectedActiveEnrollmentRows);
  };

  const onCancelBulkUnenroll = () => {
    setBulkUnenrollTargets([]);
  };

  const onConfirmBulkUnenroll = async () => {
    const targets = bulkUnenrollTargets;
    setBulkUnenrollTargets([]);
    if (!targets.length) return;

    setBulkUnenrolling(true);
    try {
      const response = await bulkUpdateEnrollments({
        enrollmentIds: targets.map((row) => row.id),
        status: "INACTIVE"
      });
      const data = response?.data || {};
      const updatedIds = Array.isArray(data.updatedIds) ? data.updatedIds : [];
      const invalidCount = Number(data.invalid || 0);

      if (updatedIds.length > 0) {
        setSelectedEnrollmentIds((current) => current.filter((id) => !updatedIds.includes(id)));
        await loadEnrollments(batchId, rosterPage);
      }

      if (invalidCount > 0) {
        toast.error(`${invalidCount} enrollment${invalidCount > 1 ? "s" : ""} could not be updated.`);
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to update enrollments.");
    } finally {
      setBulkUnenrolling(false);
    }
  };

  const onRequestBulkApplyUpdates = () => {
    if (!selectedEnrollmentRows.length) {
      toast.error("Select at least one enrollment.");
      return;
    }

    if (!hasBulkUpdateDraft) {
      toast.error("Choose a teacher or status update for the selected enrollments.");
      return;
    }

    setBulkActionMode("update");
    setBulkUpdateTargets(selectedEnrollmentRows);
  };

  const onRequestBulkClearTeacher = () => {
    if (!selectedEnrollmentRows.length) {
      toast.error("Select at least one enrollment.");
      return;
    }

    if (!selectedRowsWithTeacher.length) {
      toast.error("The selected enrollments do not have assigned teachers.");
      return;
    }

    setBulkActionMode("clear");
    setBulkUpdateTargets(selectedEnrollmentRows);
  };

  const onCancelBulkUpdate = () => {
    setBulkUpdateTargets([]);
    setBulkActionMode("update");
  };

  const onConfirmBulkUpdate = async () => {
    const targets = bulkUpdateTargets;
    setBulkUpdateTargets([]);
    if (!targets.length) return;

    setBulkUpdating(true);
    try {
      const response = await bulkUpdateEnrollments({
        enrollmentIds: targets.map((row) => row.id),
        ...(bulkStatus ? { status: bulkStatus } : {}),
        ...(bulkActionMode === "clear"
          ? { assignedTeacherUserId: "" }
          : bulkTeacherUserId
            ? { assignedTeacherUserId: bulkTeacherUserId }
            : {})
      });
      const data = response?.data || {};
      const updatedIds = Array.isArray(data.updatedIds) ? data.updatedIds : [];
      const invalidCount = Number(data.invalid || 0);

      if (updatedIds.length > 0) {
        await loadEnrollments(batchId, rosterPage);
      }

      setBulkStatus("");
      if (bulkActionMode === "update") {
        setBulkTeacherUserId("");
      }

      if (invalidCount > 0) {
        toast.error(`${invalidCount} enrollment${invalidCount > 1 ? "s" : ""} could not be updated.`);
      }
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to update enrollments.");
    } finally {
      setBulkUpdating(false);
      setBulkActionMode("update");
    }
  };

  return {
    selectedEnrollmentIds,
    setSelectedEnrollmentIds,
    selectedEnrollmentCount: selectedEnrollmentRows.length,
    selectedActiveEnrollmentCount: selectedActiveEnrollmentRows.length,
    selectedRowsWithTeacherCount: selectedRowsWithTeacher.length,
    bulkTeacherDropdownOptions,
    bulkTeacherUserId,
    setBulkTeacherUserId,
    bulkStatus,
    setBulkStatus,
    bulkUpdateTargets,
    bulkActionMode,
    bulkUpdating,
    bulkUnenrollTargets,
    bulkUnenrolling,
    unenrollTarget,
    selectedBulkTeacherLabel,
    onRequestUnenroll,
    onCancelUnenroll,
    onConfirmUnenroll,
    onRequestBulkUnenroll,
    onCancelBulkUnenroll,
    onConfirmBulkUnenroll,
    onRequestBulkApplyUpdates,
    onRequestBulkClearTeacher,
    onCancelBulkUpdate,
    onConfirmBulkUpdate
  };
}

export { useCenterEnrollmentBulkActions };