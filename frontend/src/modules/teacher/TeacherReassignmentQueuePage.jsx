import { useEffect, useMemo, useState } from "react";
import { PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  bulkAssignWorksheetToStudents,
  getTeacherAssignWorksheets,
  listTeacherReassignmentRequests,
  listMyStudents,
  saveTeacherAssignWorksheets,
  reviewTeacherReassignmentRequest,
  teacherDirectReassign
} from "../../services/teacherPortalService";

function formatStudentLabel(student) {
  const fullName = String(student?.fullName || "").trim();
  const admissionNo = String(student?.admissionNo || student?.studentCode || "").trim();
  if (fullName && admissionNo) return `${fullName} (${admissionNo})`;
  return fullName || admissionNo || "—";
}

function formatLevelLabel(level) {
  if (!level?.name && level?.rank == null) return "—";
  if (level?.name && level?.rank != null) return `${level.name} / ${level.rank}`;
  return level?.name || String(level?.rank || "—");
}

function TeacherReassignmentQueuePage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("PENDING");
  const [viewMode, setViewMode] = useState("table");

  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewAction, setReviewAction] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const [studentsLoading, setStudentsLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [studentLimit, setStudentLimit] = useState(10);
  const [studentOffset, setStudentOffset] = useState(0);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const [assignTarget, setAssignTarget] = useState(null);
  const [assignContextLoading, setAssignContextLoading] = useState(false);
  const [assignContext, setAssignContext] = useState(null);
  const [assignSelectedIds, setAssignSelectedIds] = useState([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [handledRequestIds, setHandledRequestIds] = useState([]);

  const [reassignTarget, setReassignTarget] = useState(null);
  const [reassignReason, setReassignReason] = useState("");
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState("");

  const [bulkWorksheetOptions, setBulkWorksheetOptions] = useState([]);
  const [bulkOptionsLoading, setBulkOptionsLoading] = useState(false);
  const [bulkWorksheetId, setBulkWorksheetId] = useState("");
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkInfo, setBulkInfo] = useState("");

  const loadRequests = async () => {
    setLoading(true);
    setError("");
    try {
      const resp = await listTeacherReassignmentRequests({ status: filter || undefined });
      const items = resp?.data?.items || resp?.data || resp || [];
      setRequests(Array.isArray(items) ? items : []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load reassignment requests.");
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async (query = "") => {
    setStudentsLoading(true);
    setBulkError("");
    try {
      const resp = await listMyStudents({ q: query || "" });
      const items = resp?.data || resp || [];
      const nextStudents = Array.isArray(items) ? items : [];
      setStudents(nextStudents);
      setSelectedStudentIds((current) => current.filter((id) => nextStudents.some((student) => student.studentId === id)));
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setStudentsLoading(false);
    }
  };

  useEffect(() => {
    void loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    setStudentOffset(0);
    const id = setTimeout(() => {
      void loadStudents(studentQuery.trim());
    }, 200);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentQuery]);

  const selectedStudents = useMemo(
    () => students.filter((student) => selectedStudentIds.includes(student.studentId)),
    [selectedStudentIds, students]
  );

  const pagedStudents = useMemo(
    () => students.slice(studentOffset, studentOffset + studentLimit),
    [studentLimit, studentOffset, students]
  );

  const selectedLevelIds = useMemo(
    () => Array.from(new Set(selectedStudents.map((student) => student.level?.id).filter(Boolean))),
    [selectedStudents]
  );

  const canBulkAssign = selectedStudents.length > 0 && selectedLevelIds.length === 1;

  useEffect(() => {
    if (!selectedStudents.length) {
      setBulkWorksheetOptions([]);
      setBulkWorksheetId("");
      setBulkInfo("");
      return;
    }

    if (!canBulkAssign) {
      setBulkWorksheetOptions([]);
      setBulkWorksheetId("");
      return;
    }

    let cancelled = false;
    setBulkOptionsLoading(true);
    setBulkError("");

    getTeacherAssignWorksheets(selectedStudents[0].studentId)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data?.data || null;
        const nextOptions = Array.isArray(payload?.worksheets) ? payload.worksheets : [];
        setBulkWorksheetOptions(nextOptions);
        setBulkWorksheetId((current) => (nextOptions.some((item) => item.worksheetId === current) ? current : ""));
      })
      .catch((err) => {
        if (cancelled) return;
        setBulkWorksheetOptions([]);
        setBulkWorksheetId("");
        setBulkError(getFriendlyErrorMessage(err) || "Failed to load worksheet options for the selected students.");
      })
      .finally(() => {
        if (cancelled) return;
        setBulkOptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canBulkAssign, selectedStudents]);

  const handleReview = async () => {
    if (!reviewTarget || !reviewAction) return;
    setReviewing(true);
    setError("");
    setSuccess("");
    try {
      await reviewTeacherReassignmentRequest(reviewTarget.id, {
        action: reviewAction,
        reviewReason: reviewReason.trim() || undefined
      });
      setSuccess(`Request ${reviewAction === "APPROVED" ? "approved" : "rejected"} successfully.`);
      setReviewTarget(null);
      setReviewAction("");
      setReviewReason("");
      void loadRequests();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to review request.");
    } finally {
      setReviewing(false);
    }
  };

  const openAssignModal = (student) => {
    setAssignTarget(student);
    setAssignContext(null);
    setAssignSelectedIds([]);
    setAssignError("");
  };

  useEffect(() => {
    if (!assignTarget?.studentId) {
      return;
    }

    let cancelled = false;
    setAssignContextLoading(true);
    setAssignError("");

    getTeacherAssignWorksheets(assignTarget.studentId)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data?.data || null;
        const existing = Array.isArray(payload?.assignedWorksheetIds) ? payload.assignedWorksheetIds : [];
        setAssignContext(payload);
        setAssignSelectedIds(existing);
      })
      .catch((err) => {
        if (cancelled) return;
        setAssignError(getFriendlyErrorMessage(err) || "Failed to load worksheet assignment options.");
      })
      .finally(() => {
        if (cancelled) return;
        setAssignContextLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [assignTarget]);

  const handleToggleSelectedStudent = (studentId) => {
    setSelectedStudentIds((current) => (
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId]
    ));
  };

  const handleToggleAssignWorksheet = (worksheetId) => {
    setAssignSelectedIds((current) => (
      current.includes(worksheetId)
        ? current.filter((id) => id !== worksheetId)
        : [...current, worksheetId]
    ));
  };

  const handleSaveAssignments = async () => {
    if (!assignTarget?.studentId || !assignSelectedIds.length) {
      setAssignError("Select at least one worksheet.");
      return;
    }

    setAssignSaving(true);
    setAssignError("");
    setSuccess("");
    try {
      await saveTeacherAssignWorksheets(assignTarget.studentId, {
        worksheetIds: assignSelectedIds
      });
      if (assignTarget.requestId && assignTarget.requestStatus === "PENDING") {
        setHandledRequestIds((current) => (current.includes(assignTarget.requestId) ? current : [...current, assignTarget.requestId]));
        setSuccess(`Worksheets assigned to ${formatStudentLabel(assignTarget)}. The related request is still pending until you approve or reject it.`);
      } else {
        setSuccess(`Worksheets assigned to ${formatStudentLabel(assignTarget)}.`);
      }
      setAssignTarget(null);
      await loadStudents(studentQuery.trim());
      await loadRequests();
    } catch (err) {
      setAssignError(getFriendlyErrorMessage(err) || "Failed to save worksheet assignments.");
    } finally {
      setAssignSaving(false);
    }
  };

  const handleReassign = async () => {
    if (!reassignTarget?.studentId || !reassignTarget?.worksheetId) return;
    if (!reassignReason.trim()) {
      setReassignError("Reason is required.");
      return;
    }
    setReassigning(true);
    setReassignError("");
    setSuccess("");
    try {
      await teacherDirectReassign(reassignTarget.studentId, {
        currentWorksheetId: reassignTarget.worksheetId,
        type: "RETRY",
        reason: reassignReason.trim()
      });
      setSuccess(`Worksheet "${reassignTarget.worksheetTitle}" reassigned for retry.`);
      setReassignTarget(null);
      setReassignReason("");
      if (assignTarget?.studentId === reassignTarget.studentId) {
        const res = await getTeacherAssignWorksheets(assignTarget.studentId);
        const payload = res?.data?.data || null;
        const existing = Array.isArray(payload?.assignedWorksheetIds) ? payload.assignedWorksheetIds : [];
        setAssignContext(payload);
        setAssignSelectedIds(existing);
      }
      await loadRequests();
    } catch (err) {
      setReassignError(getFriendlyErrorMessage(err) || "Reassignment failed.");
    } finally {
      setReassigning(false);
    }
  };

  const handleBulkAssign = async () => {
    if (!canBulkAssign) {
      setBulkError("Select students from the same level for bulk assignment.");
      return;
    }
    if (!bulkWorksheetId) {
      setBulkError("Select a worksheet for bulk assignment.");
      return;
    }

    setBulkAssigning(true);
    setBulkError("");
    setBulkInfo("");
    setSuccess("");
    try {
      const resp = await bulkAssignWorksheetToStudents({
        worksheetId: bulkWorksheetId,
        studentIds: selectedStudentIds,
        dueDate: bulkDueDate || undefined
      });
      const results = Array.isArray(resp?.data?.results) ? resp.data.results : [];
      const successCount = results.filter((item) => item?.success).length || selectedStudentIds.length;
      setBulkInfo(`Assigned worksheet to ${successCount} student${successCount === 1 ? "" : "s"}.`);
      setSelectedStudentIds([]);
      setBulkWorksheetId("");
      setBulkDueDate("");
      await loadStudents(studentQuery.trim());
    } catch (err) {
      setBulkError(getFriendlyErrorMessage(err) || "Failed to assign worksheet to selected students.");
    } finally {
      setBulkAssigning(false);
    }
  };

  const allVisibleSelected = pagedStudents.length > 0 && pagedStudents.every((student) => selectedStudentIds.includes(student.studentId));

  if (loading) {
    return <LoadingState label="Loading reassignment requests..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Reassignment Requests</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Review student worksheet reassignment requests.</div>
      </div>

      {error ? <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div> : null}
      {success ? <div className="card" style={{ color: "var(--color-text-success)" }}>{success}</div> : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Direct Worksheet Assignment</h3>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Assign worksheets directly to your students without waiting for a reassignment request.
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Search students</span>
            <input
              className="input"
              value={studentQuery}
              onChange={(e) => setStudentQuery(e.target.value)}
              placeholder="Search by admission no or student name"
            />
          </label>

          <div style={{ display: "flex", gap: 10, alignItems: "end", justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Showing {pagedStudents.length} of {students.length} students
            </div>
            <label style={{ display: "grid", gap: 6, width: 160 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Rows per page</span>
              <select
                className="select"
                value={studentLimit}
                onChange={(e) => {
                  setStudentLimit(parseInt(e.target.value, 10) || 10);
                  setStudentOffset(0);
                }}
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>
            </label>
          </div>

          {bulkError ? <p className="error" style={{ margin: 0 }}>{bulkError}</p> : null}
          {bulkInfo ? <p style={{ margin: 0, color: "var(--color-text-success)", fontWeight: 700 }}>{bulkInfo}</p> : null}

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 320px)" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="dash-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        disabled={!pagedStudents.length}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudentIds((current) => Array.from(new Set([...current, ...pagedStudents.map((student) => student.studentId)])));
                          } else {
                            setSelectedStudentIds((current) => current.filter((id) => !pagedStudents.some((student) => student.studentId === id)));
                          }
                        }}
                      />
                    </th>
                    <th>Student</th>
                    <th>Level</th>
                    <th>Assigned Worksheets</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {studentsLoading ? (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--color-text-muted)" }}>Loading students...</td>
                    </tr>
                  ) : pagedStudents.length ? (
                    pagedStudents.map((student) => (
                      <tr key={student.studentId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedStudentIds.includes(student.studentId)}
                            onChange={() => handleToggleSelectedStudent(student.studentId)}
                          />
                        </td>
                        <td>{formatStudentLabel(student)}</td>
                        <td>{formatLevelLabel(student.level)}</td>
                        <td>{student.assignedWorksheetCount || 0}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => openAssignModal(student)}
                          >
                            Assign Worksheet
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ color: "var(--color-text-muted)" }}>No students found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: 10 }}>
                <PaginationBar
                  limit={studentLimit}
                  offset={studentOffset}
                  count={pagedStudents.length}
                  total={students.length}
                  onChange={(next) => {
                    setStudentOffset(next.offset);
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Bulk assign one worksheet to multiple students.
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                Selected students: <strong>{selectedStudents.length}</strong>
              </div>
              <div style={{ fontSize: 12, color: canBulkAssign || !selectedStudents.length ? "var(--color-text-muted)" : "var(--color-text-danger)" }}>
                {selectedStudents.length === 0
                  ? "Select students to enable bulk assignment."
                  : canBulkAssign
                    ? `Level: ${formatLevelLabel(selectedStudents[0]?.level)}`
                    : "Bulk assignment requires students from the same level."}
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Worksheet</span>
                <select
                  className="select"
                  value={bulkWorksheetId}
                  onChange={(e) => setBulkWorksheetId(e.target.value)}
                  disabled={!canBulkAssign || bulkOptionsLoading}
                >
                  <option value="">{bulkOptionsLoading ? "Loading worksheets..." : "Select worksheet"}</option>
                  {bulkWorksheetOptions.map((worksheet) => (
                    <option key={worksheet.worksheetId} value={worksheet.worksheetId}>
                      {worksheet.number}. {worksheet.title}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Due Date (optional)</span>
                <input
                  className="input"
                  type="date"
                  value={bulkDueDate}
                  onChange={(e) => setBulkDueDate(e.target.value)}
                  disabled={!canBulkAssign || bulkAssigning}
                />
              </label>

              <button
                className="button"
                style={{ width: "auto" }}
                disabled={bulkAssigning || !canBulkAssign || !bulkWorksheetId}
                onClick={handleBulkAssign}
              >
                {bulkAssigning ? "Assigning..." : "Assign to Selected Students"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {["PENDING", "APPROVED", "REJECTED", "CANCELLED", ""].map((s) => (
          <button
            key={s || "ALL"}
            className={filter === s ? "button" : "button secondary"}
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            onClick={() => setFilter(s)}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        {[
          { value: "table", label: "Table View" },
          { value: "cards", label: "Card View" }
        ].map((option) => (
          <button
            key={option.value}
            className={viewMode === option.value ? "button" : "button secondary"}
            style={{ width: "auto", fontSize: 12, padding: "4px 12px" }}
            onClick={() => setViewMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="card"><div className="muted">No requests found.</div></div>
      ) : viewMode === "table" ? (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Worksheet</th>
                  <th>Type</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => (
                  <tr key={req.id}>
                    <td>{req.student?.firstName || ""} {req.student?.lastName || ""}</td>
                    <td>{req.currentWorksheet?.title || req.currentWorksheetId}</td>
                    <td>{req.type}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {req.reason}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                        background: req.status === "PENDING" ? "var(--color-bg-warning)" : req.status === "APPROVED" ? "var(--color-bg-success-light)" : req.status === "REJECTED" ? "var(--color-bg-danger-light)" : "var(--color-bg-muted)",
                        color: req.status === "PENDING" ? "var(--color-text-warning)" : req.status === "APPROVED" ? "var(--color-text-success)" : req.status === "REJECTED" ? "var(--color-text-danger)" : "var(--color-text-muted)"
                      }}>
                        {req.status}
                      </span>
                      {req.status === "PENDING" && handledRequestIds.includes(req.id) ? (
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-muted)" }}>
                          Direct assignment completed. Review this request to close it.
                        </div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 12 }}>{req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      {req.status === "PENDING" ? (
                        <span style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => openAssignModal({
                              studentId: req.student?.id || req.studentId,
                              fullName: `${req.student?.firstName || ""} ${req.student?.lastName || ""}`.trim(),
                              admissionNo: req.student?.admissionNo || "",
                              requestId: req.id,
                              requestStatus: req.status,
                              requestType: req.type,
                              requestWorksheetTitle: req.currentWorksheet?.title || req.currentWorksheetId
                            })}
                          >
                            Assign Worksheet
                          </button>
                          <button
                            className="button"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => { setReviewTarget(req); setReviewAction("APPROVED"); setReviewReason(""); }}
                          >
                            Approve
                          </button>
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => { setReviewTarget(req); setReviewAction("REJECTED"); setReviewReason(""); }}
                          >
                            Reject
                          </button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{req.reviewReason || "—"}</span>
                          <button
                            className="button secondary"
                            style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                            onClick={() => openAssignModal({
                              studentId: req.student?.id || req.studentId,
                              fullName: `${req.student?.firstName || ""} ${req.student?.lastName || ""}`.trim(),
                              admissionNo: req.student?.admissionNo || "",
                              requestId: req.id,
                              requestStatus: req.status,
                              requestType: req.type,
                              requestWorksheetTitle: req.currentWorksheet?.title || req.currentWorksheetId
                            })}
                          >
                            Assign Worksheet
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {requests.map((req) => (
            <div key={req.id} className="card" style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{`${req.student?.firstName || ""} ${req.student?.lastName || ""}`.trim() || "—"}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{req.student?.admissionNo || ""}</div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
                  background: req.status === "PENDING" ? "var(--color-bg-warning)" : req.status === "APPROVED" ? "var(--color-bg-success-light)" : req.status === "REJECTED" ? "var(--color-bg-danger-light)" : "var(--color-bg-muted)",
                  color: req.status === "PENDING" ? "var(--color-text-warning)" : req.status === "APPROVED" ? "var(--color-text-success)" : req.status === "REJECTED" ? "var(--color-text-danger)" : "var(--color-text-muted)"
                }}>
                  {req.status}
                </span>
              </div>

              <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                <div><strong>Worksheet:</strong> {req.currentWorksheet?.title || req.currentWorksheetId}</div>
                <div><strong>Type:</strong> {req.type}</div>
                <div><strong>Date:</strong> {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "—"}</div>
                <div><strong>Reason:</strong> {req.reason || "—"}</div>
                {req.reviewReason ? <div><strong>Review Note:</strong> {req.reviewReason}</div> : null}
                {req.status === "PENDING" && handledRequestIds.includes(req.id) ? (
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    Direct assignment completed. Review this request to close it.
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button
                  className="button secondary"
                  style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                  onClick={() => openAssignModal({
                    studentId: req.student?.id || req.studentId,
                    fullName: `${req.student?.firstName || ""} ${req.student?.lastName || ""}`.trim(),
                    admissionNo: req.student?.admissionNo || "",
                    requestId: req.id,
                    requestStatus: req.status,
                    requestType: req.type,
                    requestWorksheetTitle: req.currentWorksheet?.title || req.currentWorksheetId
                  })}
                >
                  Assign Worksheet
                </button>
                {req.status === "PENDING" ? (
                  <>
                    <button
                      className="button"
                      style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                      onClick={() => { setReviewTarget(req); setReviewAction("APPROVED"); setReviewReason(""); }}
                    >
                      Approve
                    </button>
                    <button
                      className="button secondary"
                      style={{ width: "auto", fontSize: 12, padding: "3px 10px" }}
                      onClick={() => { setReviewTarget(req); setReviewAction("REJECTED"); setReviewReason(""); }}
                    >
                      Reject
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {reviewTarget ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
          }}
          onClick={() => setReviewTarget(null)}
        >
          <div className="card" style={{ minWidth: 340, maxWidth: 460, padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px" }}>
              {reviewAction === "APPROVED" ? "Approve" : "Reject"} Request
            </h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
              Student: <strong>{reviewTarget.student?.firstName} {reviewTarget.student?.lastName}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" }}>
              Worksheet: <strong>{reviewTarget.currentWorksheet?.title || reviewTarget.currentWorksheetId}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 12px" }}>
              Type: <strong>{reviewTarget.type}</strong> — Reason: {reviewTarget.reason}
            </p>

            {reviewAction === "REJECTED" ? (
              <label style={{ display: "block", marginBottom: 10 }}>
                Rejection Reason (required)
                <textarea
                  className="input"
                  rows={2}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Why are you rejecting this request?"
                />
              </label>
            ) : (
              <label style={{ display: "block", marginBottom: 10 }}>
                Note (optional)
                <textarea
                  className="input"
                  rows={2}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="Optional note for approval"
                />
              </label>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setReviewTarget(null)}>
                Cancel
              </button>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={reviewing || (reviewAction === "REJECTED" && !reviewReason.trim())}
                onClick={handleReview}
              >
                {reviewing ? "Processing..." : reviewAction === "APPROVED" ? "Confirm Approve" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignTarget ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
          }}
          onClick={() => setAssignTarget(null)}
        >
          <div className="card" style={{ minWidth: 360, maxWidth: 760, width: "100%", maxHeight: "85vh", overflow: "auto", padding: 24, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 style={{ margin: 0 }}>Assign Worksheet</h3>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{formatStudentLabel(assignTarget)}</div>
            </div>

            {assignTarget.requestId && assignTarget.requestStatus === "PENDING" ? (
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", padding: "8px 10px", borderRadius: 8, background: "var(--color-bg-muted)" }}>
                This assignment was opened from a pending {String(assignTarget.requestType || "reassignment").toLowerCase()} request for
                {" "}<strong>{assignTarget.requestWorksheetTitle || "this worksheet"}</strong>. Saving assignments here does not close the request. Use Approve or Reject afterward to resolve it.
              </div>
            ) : null}

            {assignError ? <p className="error" style={{ margin: 0 }}>{assignError}</p> : null}

            {assignContextLoading ? (
              <div style={{ color: "var(--color-text-muted)" }}>Loading worksheet options...</div>
            ) : assignContext ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  Level: {formatLevelLabel(assignContext?.enrollment?.levelTitle ? { name: assignContext.enrollment.levelTitle, rank: assignContext.enrollment.levelRank } : assignContext?.student?.level)}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}></th>
                        <th>Number</th>
                        <th>Title</th>
                        <th>Assigned</th>
                        <th>Attempt</th>
                        <th>Status</th>
                        <th style={{ textAlign: "right" }}>Reassign</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(assignContext.worksheets || []).length ? (
                        assignContext.worksheets.map((worksheet) => (
                          <tr key={worksheet.worksheetId}>
                            <td>
                              <input
                                type="checkbox"
                                checked={assignSelectedIds.includes(worksheet.worksheetId)}
                                onChange={() => handleToggleAssignWorksheet(worksheet.worksheetId)}
                              />
                            </td>
                            <td>{worksheet.number}</td>
                            <td>{worksheet.title}</td>
                            <td>{worksheet.isAssigned ? "Assigned" : worksheet.wasPreviouslyAssigned ? "Previously assigned" : "—"}</td>
                            <td>{worksheet.attempt || 0}</td>
                            <td>
                              {worksheet.isSubmitted ? (
                                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "var(--color-bg-success-light)", color: "var(--color-text-success)" }}>Submitted</span>
                              ) : worksheet.attempt ? "In progress" : "—"}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              {worksheet.isSubmitted ? (
                                <button
                                  className="button secondary"
                                  style={{ width: "auto", fontSize: 11, padding: "2px 8px" }}
                                  onClick={() => {
                                    setReassignTarget({
                                      studentId: assignTarget.studentId,
                                      studentLabel: formatStudentLabel(assignTarget),
                                      worksheetId: worksheet.worksheetId,
                                      worksheetTitle: worksheet.title
                                    });
                                    setReassignReason("");
                                    setReassignError("");
                                  }}
                                >
                                  Reassign Same
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} style={{ color: "var(--color-text-muted)" }}>No worksheet options available for this student.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setAssignTarget(null)}>
                Cancel
              </button>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={assignSaving || assignContextLoading || !assignSelectedIds.length}
                onClick={handleSaveAssignments}
              >
                {assignSaving ? "Saving..." : "Save Assignments"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reassignTarget ? (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1100, padding: 16
          }}
          onClick={() => setReassignTarget(null)}
        >
          <div className="card" style={{ minWidth: 340, maxWidth: 460, padding: 24, display: "grid", gap: 12 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>Reassign Worksheet for Retry</h3>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              Student: <strong>{reassignTarget.studentLabel}</strong>
            </p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>
              Worksheet: <strong>{reassignTarget.worksheetTitle}</strong>
            </p>
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
              This will delete the student&apos;s previous submission and allow them to re-attempt the same worksheet.
            </p>
            {reassignError ? <p className="error" style={{ margin: 0 }}>{reassignError}</p> : null}
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12 }}>Reason (required)</span>
              <textarea
                className="input"
                rows={2}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                placeholder="Why is this worksheet being reassigned?"
              />
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="button secondary" style={{ width: "auto" }} onClick={() => setReassignTarget(null)}>
                Cancel
              </button>
              <button
                className="button"
                style={{ width: "auto" }}
                disabled={reassigning || !reassignReason.trim()}
                onClick={handleReassign}
              >
                {reassigning ? "Reassigning..." : "Confirm Reassign"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { TeacherReassignmentQueuePage };
