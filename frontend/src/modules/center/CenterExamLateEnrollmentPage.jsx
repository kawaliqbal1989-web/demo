import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  createLateEnrollmentRequest,
  getLateEnrollmentEligibleStudents,
  listLateEnrollmentRequests
} from "../../services/examCyclesService";

function CenterExamLateEnrollmentPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();
  const latestLevelRequestRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState([]);
  const [levelId, setLevelId] = useState("");
  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [requestStatusSummary, setRequestStatusSummary] = useState({});
  const [counts, setCounts] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedRequestId, setExpandedRequestId] = useState("");

  const pendingRequestCount =
    Number(requestStatusSummary.SUBMITTED || 0) +
    Number(requestStatusSummary.UNDER_REVIEW || 0) +
    Number(requestStatusSummary.PARTIALLY_APPROVED || 0);
  const rejectedRequestCount = Number(requestStatusSummary.REJECTED || 0);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === expandedRequestId) || null,
    [requests, expandedRequestId]
  );

  const load = async (selectedLevelId) => {
    setLoading(true);
    setError("");
    try {
      const [eligibleRes, requestsRes] = await Promise.all([
        getLateEnrollmentEligibleStudents(examCycleId, {
          ...(selectedLevelId ? { levelId: selectedLevelId } : {})
        }),
        listLateEnrollmentRequests(examCycleId, { status: "ALL" })
      ]);

      const availableLevels = Array.isArray(eligibleRes?.data?.availableLevels) ? eligibleRes.data.availableLevels : [];
      const effectiveLevelId = String(eligibleRes?.data?.levelId || "").trim();

      setLevels(availableLevels);
      setLevelId(effectiveLevelId);
      setEligibleStudents(Array.isArray(eligibleRes?.data?.eligibleStudents) ? eligibleRes.data.eligibleStudents : []);
      setRequests(requestsRes?.data?.requests || []);
      setRequestStatusSummary(requestsRes?.data?.requestStatusSummary || {});
      setCounts(eligibleRes?.data?.counts || requestsRes?.data?.counts || null);
      setSelectedStudentIds([]);

      if (expandedRequestId && !(requestsRes?.data?.requests || []).some((request) => request.id === expandedRequestId)) {
        setExpandedRequestId("");
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load late enrollment data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const selectedSet = useMemo(() => new Set(selectedStudentIds), [selectedStudentIds]);

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
  };

  const submitRequest = async () => {
    if (!levelId || !selectedStudentIds.length || submitting) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await createLateEnrollmentRequest(examCycleId, {
        levelId,
        studentIds: Array.from(new Set(selectedStudentIds)),
        remarks
      });
      setRemarks("");
      await load(levelId);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit late enrollment request.");
    } finally {
      setSubmitting(false);
    }
  };

  const refreshEligible = async (nextLevelId) => {
    const resolvedLevelId = String(nextLevelId || "");
    const requestToken = latestLevelRequestRef.current + 1;
    latestLevelRequestRef.current = requestToken;

    setLevelId(resolvedLevelId);
    setSelectedStudentIds([]);
    setEligibleStudents([]);
    setError("");

    if (!resolvedLevelId) {
      return;
    }

    setEligibleLoading(true);
    try {
      const eligibleRes = await getLateEnrollmentEligibleStudents(examCycleId, { levelId: resolvedLevelId });
      if (requestToken !== latestLevelRequestRef.current) {
        return;
      }

      setEligibleStudents(eligibleRes?.data?.eligibleStudents || []);
      setLevels(Array.isArray(eligibleRes?.data?.availableLevels) ? eligibleRes.data.availableLevels : levels);
      setLevelId(String(eligibleRes?.data?.levelId || resolvedLevelId));
      setCounts(eligibleRes?.data?.counts || counts);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load eligible students.");
    } finally {
      if (requestToken === latestLevelRequestRef.current) {
        setEligibleLoading(false);
      }
    }
  };

  if (loading) {
    return <LoadingState label="Loading late enrollment..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Center Exam Late Enrollment</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Create and track late enrollment requests</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      {counts ? (
        <div className="card" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div>Normal: <b>{counts.normalEnrollmentCount}</b></div>
          <div>Late: <b>{counts.lateEnrollmentCount}</b></div>
          <div>Total: <b>{counts.totalEnrollmentCount}</b></div>
          <div>Pending Requests: <b>{pendingRequestCount}</b></div>
          <div>Rejected Requests: <b>{rejectedRequestCount}</b></div>
        </div>
      ) : null}

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label htmlFor="late-level" style={{ fontSize: 12 }}>Level</label>
          <select
            id="late-level"
            className="input"
            value={levelId}
            onChange={(e) => void refreshEligible(e.target.value)}
            style={{ width: 240 }}
          >
            {!levels.length ? <option value="">No mapped levels available</option> : null}
            {levels.map((level) => (
              <option key={level.levelId} value={level.levelId}>{level.levelName || `Level ${level.levelNumber || ""}`.trim()}</option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={() => void load(levelId)} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>

        {eligibleLoading ? (
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Loading students for selected level...</div>
        ) : null}

        <DataTable
          keyField="id"
          rows={eligibleStudents}
          emptyMessage="No eligible students for selected level"
          columns={[
            {
              key: "pick",
              header: "Pick",
              render: (row) => (
                <input
                  type="checkbox"
                  checked={selectedSet.has(row.id)}
                  onChange={() => toggleStudent(row.id)}
                />
              )
            },
            { key: "admissionNo", header: "Admission No" },
            {
              key: "name",
              header: "Student",
              render: (row) => `${row.firstName || ""} ${row.lastName || ""}`.trim()
            },
            {
              key: "level",
              header: "Level",
              render: (row) => row?.level?.name || ""
            },
            {
              key: "course",
              header: "Course",
              render: (row) => row?.course?.code || row?.course?.name || "-"
            }
          ]}
        />

        <textarea
          className="input"
          placeholder="Remarks (optional)"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          rows={3}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Selected students: {selectedStudentIds.length}</div>
          <button
            className="button"
            type="button"
            onClick={() => void submitRequest()}
            disabled={!selectedStudentIds.length || submitting}
            style={{ width: "auto" }}
          >
            {submitting ? "Submitting..." : "Submit Request"}
          </button>
        </div>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Request History</h3>
        <DataTable
          keyField="id"
          rows={requests}
          emptyMessage="No late enrollment requests yet"
          columns={[
            { key: "id", header: "Request", render: (row) => row.id.slice(0, 10) },
            { key: "status", header: "Status" },
            {
              key: "level",
              header: "Level",
              render: (row) => row?.requestedLevel?.name || row?.requestedLevels?.map((item) => item?.name).filter(Boolean).join(", ") || "-"
            },
            { key: "students", header: "Students", render: (row) => row.studentCount ?? (row.students?.length || 0) },
            {
              key: "submittedBy",
              header: "Submitted By",
              render: (row) => row?.submittedBy?.username || "-"
            },
            { key: "submittedAt", header: "Submitted At", render: (row) => new Date(row.submittedAt).toLocaleString() },
            { key: "reviewedAt", header: "Reviewed At", render: (row) => row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : "-" },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setExpandedRequestId((prev) => (prev === row.id ? "" : row.id))}
                  style={{ width: "auto" }}
                >
                  {expandedRequestId === row.id ? "Hide" : "View Details"}
                </button>
              )
            }
          ]}
        />

        {selectedRequest ? (
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h4 style={{ margin: 0 }}>Request {selectedRequest.id.slice(0, 12)}</h4>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Last Updated: {new Date(selectedRequest.updatedAt).toLocaleString()}</div>
            </div>

            <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
              <div><strong>Status:</strong> {selectedRequest.status}</div>
              <div><strong>Requested Level:</strong> {selectedRequest?.requestedLevel?.name || selectedRequest?.requestedLevels?.map((item) => item?.name).filter(Boolean).join(", ") || "-"}</div>
              <div><strong>Submitted By:</strong> {selectedRequest?.submittedBy?.username || "-"}</div>
              <div><strong>Submitted At:</strong> {selectedRequest?.submittedAt ? new Date(selectedRequest.submittedAt).toLocaleString() : "-"}</div>
              <div><strong>Reviewed By:</strong> {selectedRequest?.reviewedBy?.username || "-"}</div>
              <div><strong>Reviewed At:</strong> {selectedRequest?.reviewedAt ? new Date(selectedRequest.reviewedAt).toLocaleString() : "-"}</div>
              <div><strong>Center Remarks:</strong> {selectedRequest?.remarks || "-"}</div>
            </div>

            <DataTable
              keyField="id"
              rows={selectedRequest.students || []}
              emptyMessage="No students in this request"
              columns={[
                { key: "admissionNo", header: "Admission No", render: (row) => row?.student?.admissionNo || "-" },
                {
                  key: "name",
                  header: "Student",
                  render: (row) => `${row?.student?.firstName || ""} ${row?.student?.lastName || ""}`.trim() || "-"
                },
                { key: "level", header: "Requested Level", render: (row) => row?.level?.name || "-" },
                { key: "status", header: "Status" },
                { key: "reviewRemarks", header: "Review/Return/Rejection Remarks", render: (row) => row?.reviewRemarks || "-" }
              ]}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export { CenterExamLateEnrollmentPage };
