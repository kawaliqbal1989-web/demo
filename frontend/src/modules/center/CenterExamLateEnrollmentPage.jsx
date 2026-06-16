import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listLevels } from "../../services/levelsService";
import {
  createLateEnrollmentRequest,
  getLateEnrollmentEligibleStudents,
  listLateEnrollmentRequests
} from "../../services/examCyclesService";

function CenterExamLateEnrollmentPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [levels, setLevels] = useState([]);
  const [levelId, setLevelId] = useState("");
  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async (selectedLevelId) => {
    setLoading(true);
    setError("");
    try {
      const [levelsRes, requestsRes] = await Promise.all([
        listLevels(),
        listLateEnrollmentRequests(examCycleId, { status: "ALL" })
      ]);

      const nextLevels = Array.isArray(levelsRes?.data) ? levelsRes.data : [];
      const effectiveLevelId = selectedLevelId || nextLevels[0]?.id || "";

      setLevels(nextLevels);
      setLevelId(effectiveLevelId);
      setRequests(requestsRes?.data?.requests || []);
      setCounts(requestsRes?.data?.counts || null);

      if (effectiveLevelId) {
        const eligibleRes = await getLateEnrollmentEligibleStudents(examCycleId, { levelId: effectiveLevelId });
        setEligibleStudents(eligibleRes?.data?.eligibleStudents || []);
        setCounts(eligibleRes?.data?.counts || requestsRes?.data?.counts || null);
      } else {
        setEligibleStudents([]);
      }
      setSelectedStudentIds([]);
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
        studentIds: selectedStudentIds,
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
    setLevelId(resolvedLevelId);
    setSelectedStudentIds([]);
    setError("");

    if (!resolvedLevelId) {
      setEligibleStudents([]);
      return;
    }

    try {
      const eligibleRes = await getLateEnrollmentEligibleStudents(examCycleId, { levelId: resolvedLevelId });
      setEligibleStudents(eligibleRes?.data?.eligibleStudents || []);
      setCounts(eligibleRes?.data?.counts || counts);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load eligible students.");
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
            {levels.map((level) => (
              <option key={level.id} value={level.id}>{level.name}</option>
            ))}
          </select>
          <button className="button secondary" type="button" onClick={() => void load(levelId)} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>

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
            { key: "id", header: "Request ID", render: (row) => row.id.slice(0, 10) },
            { key: "status", header: "Status" },
            { key: "submittedAt", header: "Submitted At", render: (row) => new Date(row.submittedAt).toLocaleString() },
            { key: "students", header: "Students", render: (row) => row.students?.length || 0 },
            { key: "reviewedAt", header: "Reviewed At", render: (row) => row.reviewedAt ? new Date(row.reviewedAt).toLocaleString() : "-" }
          ]}
        />
      </div>
    </section>
  );
}

export { CenterExamLateEnrollmentPage };
