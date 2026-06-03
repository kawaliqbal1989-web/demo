import { useEffect, useMemo, useState } from "react";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { listBatches } from "../../services/batchesService";
import { listCenterAvailableCourses } from "../../services/centerService";
import { exportEnrollmentsCsvUrl, updateEnrollment } from "../../services/enrollmentsService";
import { listLevels } from "../../services/levelsService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { CenterEnrollmentsBulkActions } from "./CenterEnrollmentsBulkActions";
import { CenterEnrollmentsDialogs } from "./CenterEnrollmentsDialogs";
import { CenterEnrollmentsFilters } from "./CenterEnrollmentsFilters";
import { CenterEnrollmentsPagination } from "./CenterEnrollmentsPagination";
import { CenterEnrollmentsRosterTable } from "./CenterEnrollmentsRosterTable";
import { CenterEnrollmentsSummaryStrip } from "./CenterEnrollmentsSummaryStrip";
import { useCenterEnrollmentBulkActions } from "./useCenterEnrollmentBulkActions";
import { useCenterEnrollmentsRoster } from "./useCenterEnrollmentsRoster";
import { useCenterEnrollmentForm } from "./useCenterEnrollmentForm";

function matchesTeacherBatch(batch, teacherUserId) {
  if (!teacherUserId || !batch) return false;
  if (String(batch.primaryTeacherUserId || "") === String(teacherUserId)) {
    return true;
  }
  return (batch.teacherAssignments || []).some((assignment) => String(assignment?.teacher?.id || "") === String(teacherUserId));
}

function CenterEnrollmentsPage() {
  const [batches, setBatches] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [levels, setLevels] = useState([]);
  const [selectedTeacherUserId, setSelectedTeacherUserId] = useState("");
  const [pageError, setPageError] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editEnrollmentId, setEditEnrollmentId] = useState("");
  const [editTeacherUserId, setEditTeacherUserId] = useState("");
  const [editBatchId, setEditBatchId] = useState("");

  const {
    batchId,
    setBatchId,
    rows,
    loading: rosterLoading,
    error: rosterError,
    setError: setRosterError,
    rosterPage,
    rosterTotal,
    rosterQuery,
    setRosterQuery,
    rosterTeacherUserId,
    setRosterTeacherUserId,
    rosterLevelId,
    setRosterLevelId,
    rosterStatus,
    setRosterStatus,
    rosterStudentActive,
    setRosterStudentActive,
    rosterFrom,
    setRosterFrom,
    rosterTo,
    setRosterTo,
    rosterFeeStatus,
    setRosterFeeStatus,
    rosterPendingInstallments,
    setRosterPendingInstallments,
    rosterFilters,
    rosterSummary,
    loadEnrollments,
    clearRosterFilters,
    pageSize: ROSTER_PAGE_SIZE
  } = useCenterEnrollmentsRoster({ pageSize: 100 });

  const [courses, setCourses] = useState([]);

  const teacherOptions = useMemo(
    () => teachers.filter((t) => t?.role === "TEACHER" && t?.isActive !== false),
    [teachers]
  );
  const teacherDropdownOptions = useMemo(
    () => teacherOptions.map((teacher) => ({
      value: teacher.id,
      label: teacher?.teacherProfile?.fullName || teacher.username || teacher.email || "Teacher"
    })),
    [teacherOptions]
  );
  const teacherFilteredBatches = useMemo(
    () => batches.filter((batch) => matchesTeacherBatch(batch, selectedTeacherUserId)),
    [batches, selectedTeacherUserId]
  );
  const batchDropdownOptions = useMemo(
    () => teacherFilteredBatches.map((batch) => ({ value: batch.id, label: batch.name })),
    [teacherFilteredBatches]
  );
  const editBatchDropdownOptions = useMemo(
    () => batches
      .filter((batch) => matchesTeacherBatch(batch, editTeacherUserId))
      .map((batch) => ({ value: batch.id, label: batch.name })),
    [batches, editTeacherUserId]
  );
  const {
    PAGE_SIZE,
    students,
    studentQuery,
    setStudentQuery,
    studentsLoading,
    studentsError,
    studentId,
    setStudentId,
    assignedTeacherUserId,
    setAssignedTeacherUserId,
    courseId,
    setCourseId,
    courseLevelId,
    setCourseLevelId,
    courseLevels,
    courseLevelsLoading,
    creating,
    studentPage,
    studentTotal,
    studentDropdownOptions,
    loadStudentOptions,
    clearStudentSearch,
    resetEnrollmentForm,
    submitEnrollment
  } = useCenterEnrollmentForm({
    batchId,
    teacherOptions,
    batches,
    rosterPage,
    loadEnrollments,
    onError: setPageError
  });

  const {
    selectedEnrollmentIds,
    setSelectedEnrollmentIds,
    selectedEnrollmentCount,
    selectedActiveEnrollmentCount,
    selectedRowsWithTeacherCount,
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
  } = useCenterEnrollmentBulkActions({
    rows,
    teacherOptions,
    batchId,
    rosterPage,
    loadEnrollments
  });

  const bootstrap = async () => {
    setBootstrapping(true);
    setPageError("");
    setRosterError("");
    try {
      const [b, t, c, levelsResponse] = await Promise.all([
        listBatches({ limit: 500, offset: 0, includeArchived: false }),
        listTeachers({ limit: 500, offset: 0, status: "ACTIVE" }),
        listCenterAvailableCourses(),
        listLevels()
      ]);
      setBatches(b.data?.items || []);
      setTeachers(t.data || []);
      setCourses(Array.isArray(c?.data) ? c.data : c?.data?.items || []);
      setLevels(Array.isArray(levelsResponse?.data) ? levelsResponse.data : levelsResponse?.data?.items || []);
      await loadStudentOptions("", 0);
      if (batchId) {
        await loadEnrollments(batchId, rosterPage, rosterFilters);
      }
    } catch (err) {
      setPageError(getFriendlyErrorMessage(err) || "Failed to load setup data.");
    } finally {
      setBootstrapping(false);
    }
  };

  useEffect(() => {
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSelectTeacher = (teacherUserId) => {
    setSelectedTeacherUserId(teacherUserId || "");
    setBatchId("");
    setSelectedEnrollmentIds([]);
    resetEnrollmentForm();
  };

  const onSelectBatch = async (id) => {
    if (!selectedTeacherUserId) return;
    setBatchId(id);
    setSelectedEnrollmentIds([]);
    resetEnrollmentForm();
    const batch = batches.find((b) => b.id === id);
    if (batch?.primaryTeacherUserId) {
      setAssignedTeacherUserId(batch.primaryTeacherUserId);
    } else if (selectedTeacherUserId) {
      setAssignedTeacherUserId(selectedTeacherUserId);
    }
    await loadEnrollments(id, 0);
  };

  const onRequestEditEnrollment = (row) => {
    const rowBatch = batches.find((batch) => batch.id === row?.batch?.id || batch.id === row?.batchId);
    const autoTeacherId = row?.assignedTeacher?.id
      || rowBatch?.primaryTeacherUserId
      || rowBatch?.teacherAssignments?.[0]?.teacher?.id
      || "";
    const autoBatchId = row?.batch?.id || row?.batchId || "";

    setEditEnrollmentId(row?.id || "");
    setEditTeacherUserId(autoTeacherId);
    setEditBatchId(autoBatchId);
    setEditError("");
    setEditOpen(true);
  };

  const onCloseEditModal = () => {
    if (editSaving) return;
    setEditOpen(false);
    setEditError("");
    setEditEnrollmentId("");
    setEditTeacherUserId("");
    setEditBatchId("");
  };

  const onEditTeacherChange = (teacherUserId) => {
    setEditTeacherUserId(teacherUserId || "");
    if (!teacherUserId) {
      setEditBatchId("");
      return;
    }

    const nextBatches = batches.filter((batch) => matchesTeacherBatch(batch, teacherUserId));
    if (!nextBatches.some((batch) => batch.id === editBatchId)) {
      setEditBatchId(nextBatches[0]?.id || "");
    }
  };

  const onSaveEditModal = async () => {
    if (!editEnrollmentId) return;
    if (!editTeacherUserId || !editBatchId) {
      setEditError("Teacher and batch are required.");
      return;
    }

    setEditSaving(true);
    setEditError("");
    try {
      await updateEnrollment(editEnrollmentId, {
        assignedTeacherUserId: editTeacherUserId,
        batchId: editBatchId
      });
      await loadEnrollments(batchId, rosterPage);
      onCloseEditModal();
    } catch (error) {
      setEditError(getFriendlyErrorMessage(error) || "Failed to update enrollment.");
    } finally {
      setEditSaving(false);
    }
  };

  const onApplyRosterFilters = async () => {
    await loadEnrollments(batchId, 0);
  };

  const onClearRosterFilters = async () => {
    await clearRosterFilters();
  };

  const handleAssignTeacher = async (enrollmentId, teacherUserId) => {
    await updateEnrollment(enrollmentId, { assignedTeacherUserId: teacherUserId });
    await loadEnrollments(batchId, rosterPage);
  };

  const handleQuickFilter = (patch) => {
    if (patch.teacherUserId !== undefined) setRosterTeacherUserId(patch.teacherUserId);
    if (patch.feeStatus !== undefined) setRosterFeeStatus(patch.feeStatus);
    if (patch.pendingInstallments !== undefined) setRosterPendingInstallments(patch.pendingInstallments);
    if (patch.studentActive !== undefined) setRosterStudentActive(patch.studentActive);
    void loadEnrollments(batchId, 0, patch);
  };

  if ((bootstrapping || rosterLoading) && !batches.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const error = pageError || rosterError;

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Enrollments / Roster" subtitle="View roster by batch and enroll/unenroll students" />

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
          <label>
            Teacher
            <SearchableDropdown
              options={teacherDropdownOptions}
              value={selectedTeacherUserId}
              onChange={onSelectTeacher}
              placeholder="Select teacher"
            />
          </label>

          <label>
            Batch
            <SearchableDropdown
              options={batchDropdownOptions}
              value={batchId}
              onChange={(value) => void onSelectBatch(value)}
              placeholder={selectedTeacherUserId ? "Select batch" : "Select teacher first"}
              disabled={!selectedTeacherUserId}
            />
          </label>
        </div>

        {!selectedTeacherUserId ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Select a teacher to load only their assigned batches.
          </div>
        ) : null}

        {batchId ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <a
              className="button secondary"
              href={exportEnrollmentsCsvUrl({
                batchId,
                status: rosterStatus,
                q: rosterQuery.trim(),
                teacherUserId: rosterTeacherUserId,
                levelId: rosterLevelId,
                studentActive: rosterStudentActive,
                from: rosterFrom,
                to: rosterTo,
                feeStatus: rosterFeeStatus,
                pendingInstallments: rosterPendingInstallments
              })}
              target="_blank"
              rel="noreferrer"
            >
              Export CSV
            </a>
            <button className="button secondary" style={{ width: "auto" }} onClick={() => void loadEnrollments(batchId, rosterPage)}>
              Refresh
            </button>
          </div>
        ) : null}
      </div>

      {batchId ? (
        <form className="card" onSubmit={(e) => void submitEnrollment(e)} style={{ display: "grid", gap: 10 }}>
          <h3 style={{ marginTop: 0 }}>Enroll Student</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ minWidth: 260, flex: "1 1 320px" }}>
              Search student
              <input
                className="input"
                placeholder="Admission no or name"
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              onClick={clearStudentSearch}
              disabled={studentsLoading}
            >
              Clear
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--color-text-muted)" }}>
            <span>Showing {students.length} of {studentTotal} students{studentQuery.trim() ? ` matching "${studentQuery.trim()}"` : ""}</span>
            <span>Only students without an active enrollment are available here.</span>
            <span>{studentsLoading ? "Updating matches..." : "Search updates automatically."}</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={studentsLoading || studentPage === 0}
              onClick={() => void loadStudentOptions(studentQuery.trim(), studentPage - 1)}
            >
              ← Prev
            </button>
            <span>Page {studentPage + 1} of {Math.max(1, Math.ceil(studentTotal / PAGE_SIZE))}</span>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto", padding: "2px 10px", fontSize: 12 }}
              disabled={studentsLoading || (studentPage + 1) * PAGE_SIZE >= studentTotal}
              onClick={() => void loadStudentOptions(studentQuery.trim(), studentPage + 1)}
            >
              Next →
            </button>
          </div>
          {studentsError ? <div className="error">{studentsError}</div> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <label>
              Student
              <SearchableDropdown
                options={studentDropdownOptions}
                value={studentId}
                onChange={setStudentId}
                placeholder={studentsLoading ? "Loading students..." : "Select eligible student"}
                disabled={studentsLoading}
              />
            </label>

            <label>
              Assigned teacher (optional)
              <SearchableDropdown
                options={teacherDropdownOptions}
                value={assignedTeacherUserId}
                onChange={setAssignedTeacherUserId}
                placeholder="Assign teacher"
              />
            </label>

            <label>
              Course (optional)
              <select
                className="select"
                value={courseId}
                onChange={(e) => {
                  setCourseId(e.target.value);
                  setCourseLevelId("");
                }}
              >
                <option value="">None</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Course level (optional)
              <select
                className="select"
                value={courseLevelId}
                onChange={(e) => setCourseLevelId(e.target.value)}
                disabled={!courseId || courseLevelsLoading}
              >
                <option value="">{!courseId ? "Select course first" : courseLevelsLoading ? "Loading..." : "None"}</option>
                {courseLevels.map((item) => (
                  <option key={item.id} value={item?.level?.id || ""}>
                    {item?.title || item?.level?.name || `Level ${item?.levelNumber || ""}`}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!studentId && (
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Select a student to enable enrollment.
            </div>
          )}
          <button className="button" disabled={creating || !studentId} style={{ width: "auto" }}>
            {creating ? "Enrolling..." : "Enroll"}
          </button>
        </form>
      ) : (
        <div className="card" style={{ color: "var(--color-text-muted)" }}>
          Select teacher and batch to view the roster.
        </div>
      )}

      {batchId ? (
        <>
          <CenterEnrollmentsFilters
            rosterQuery={rosterQuery}
            onRosterQueryChange={setRosterQuery}
            rosterTeacherUserId={rosterTeacherUserId}
            onRosterTeacherUserIdChange={setRosterTeacherUserId}
            teacherOptions={teacherOptions}
            rosterLevelId={rosterLevelId}
            onRosterLevelIdChange={setRosterLevelId}
            levels={levels}
            rosterStatus={rosterStatus}
            onRosterStatusChange={setRosterStatus}
            rosterStudentActive={rosterStudentActive}
            onRosterStudentActiveChange={setRosterStudentActive}
            rosterFrom={rosterFrom}
            onRosterFromChange={setRosterFrom}
            rosterTo={rosterTo}
            onRosterToChange={setRosterTo}
            rosterFeeStatus={rosterFeeStatus}
            onRosterFeeStatusChange={setRosterFeeStatus}
            rosterPendingInstallments={rosterPendingInstallments}
            onRosterPendingInstallmentsChange={setRosterPendingInstallments}
            onApplyRosterFilters={() => void onApplyRosterFilters()}
            onClearRosterFilters={() => void onClearRosterFilters()}
            onQuickFilter={handleQuickFilter}
          />

          <CenterEnrollmentsSummaryStrip rosterSummary={rosterSummary} rosterTotal={rosterTotal} />

          <CenterEnrollmentsBulkActions
            selectedEnrollmentCount={selectedEnrollmentCount}
            selectedRowsWithTeacherCount={selectedRowsWithTeacherCount}
            bulkTeacherDropdownOptions={bulkTeacherDropdownOptions}
            bulkTeacherUserId={bulkTeacherUserId}
            onBulkTeacherUserIdChange={setBulkTeacherUserId}
            bulkStatus={bulkStatus}
            onBulkStatusChange={setBulkStatus}
            bulkUpdating={bulkUpdating}
            bulkActionMode={bulkActionMode}
            onRequestBulkApplyUpdates={onRequestBulkApplyUpdates}
            onRequestBulkClearTeacher={onRequestBulkClearTeacher}
          />

          <CenterEnrollmentsRosterTable
            rows={rows}
            selectedEnrollmentIds={selectedEnrollmentIds}
            onSelectionChange={setSelectedEnrollmentIds}
            bulkUnenrolling={bulkUnenrolling}
            selectedActiveEnrollmentCount={selectedActiveEnrollmentCount}
            onRequestBulkUnenroll={onRequestBulkUnenroll}
            onRequestUnenroll={onRequestUnenroll}
            teacherOptions={teacherOptions}
            onAssignTeacher={handleAssignTeacher}
            onRequestEditEnrollment={onRequestEditEnrollment}
          />
          <CenterEnrollmentsPagination
            rowsCount={rows.length}
            rosterTotal={rosterTotal}
            rosterLoading={rosterLoading}
            rosterPage={rosterPage}
            pageSize={ROSTER_PAGE_SIZE}
            onPrevPage={() => void loadEnrollments(batchId, rosterPage - 1)}
            onNextPage={() => void loadEnrollments(batchId, rosterPage + 1)}
          />
        </>
      ) : null}

      {editOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" style={{ display: "grid", placeItems: "center" }}>
          <div className="card" style={{ width: "min(560px, 92vw)", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h3 style={{ margin: 0 }}>Edit Enrollment</h3>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onCloseEditModal} disabled={editSaving}>
                Close
              </button>
            </div>

            {editError ? <div className="error">{editError}</div> : null}

            <label>
              Teacher
              <SearchableDropdown
                options={teacherDropdownOptions}
                value={editTeacherUserId}
                onChange={onEditTeacherChange}
                placeholder="Select teacher"
              />
            </label>

            <label>
              Batch
              <SearchableDropdown
                options={editBatchDropdownOptions}
                value={editBatchId}
                onChange={setEditBatchId}
                placeholder={editTeacherUserId ? "Select batch" : "Select teacher first"}
                disabled={!editTeacherUserId}
              />
            </label>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onCloseEditModal} disabled={editSaving}>
                Cancel
              </button>
              <button className="button" type="button" style={{ width: "auto" }} onClick={() => void onSaveEditModal()} disabled={editSaving || !editTeacherUserId || !editBatchId}>
                {editSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <CenterEnrollmentsDialogs
        unenrollTarget={unenrollTarget}
        onCancelUnenroll={onCancelUnenroll}
        onConfirmUnenroll={onConfirmUnenroll}
        bulkUnenrollTargets={bulkUnenrollTargets}
        bulkUnenrolling={bulkUnenrolling}
        onCancelBulkUnenroll={onCancelBulkUnenroll}
        onConfirmBulkUnenroll={onConfirmBulkUnenroll}
        bulkUpdateTargets={bulkUpdateTargets}
        bulkActionMode={bulkActionMode}
        bulkUpdating={bulkUpdating}
        bulkStatus={bulkStatus}
        selectedBulkTeacherLabel={selectedBulkTeacherLabel}
        onCancelBulkUpdate={onCancelBulkUpdate}
        onConfirmBulkUpdate={onConfirmBulkUpdate}
      />
    </section>
  );
}

export { CenterEnrollmentsPage };
