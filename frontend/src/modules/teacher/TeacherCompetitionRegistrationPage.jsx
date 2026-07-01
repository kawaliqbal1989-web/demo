import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { LoadingState } from "../../components/LoadingState";
import { EmptyState } from "../../components/EmptyState";
import { getCompetitionDetail, getCompetitionRegistrations, enrollCompetitionStudent } from "../../services/competitionsService";
import { listLevels } from "../../services/levelsService";
import { listMyStudents } from "../../services/teacherPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function unwrapStudents(response) {
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.items)) return response.data.items;
  if (Array.isArray(response?.items)) return response.items;
  return [];
}

function unwrapRegistrations(response) {
  if (Array.isArray(response?.data?.registrations)) return response.data.registrations;
  if (Array.isArray(response?.registrations)) return response.registrations;
  return [];
}

function normalizeRegisteredStudent(row) {
  const student = row?.student || {};
  const fullName = `${student.firstName || ""} ${student.lastName || ""}`.trim();
  return {
    studentId: row?.studentId || student.id,
    fullName: fullName || student.admissionNo || "-",
    studentName: fullName || student.admissionNo || "-",
    level: row?.competitionLevel || row?.academicLevel || row?.level || null,
    alreadyRegistered: true,
    isTemporaryCompetitionStudent: Boolean(student.isTemporaryExam)
  };
}

function TeacherCompetitionRegistrationPage() {
  const navigate = useNavigate();
  const { competitionId } = useParams();

  const [competition, setCompetition] = useState(null);
  const [levels, setLevels] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [selectedLevels, setSelectedLevels] = useState({});
  const [draftSaved, setDraftSaved] = useState(false);

  const selectedCount = selectedStudentIds.length;
  const hasStudents = students.length > 0;

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [competitionResponse, levelsResponse, studentsResponse, registrationsResponse] = await Promise.all([
        getCompetitionDetail(competitionId),
        listLevels({ limit: 100, offset: 0 }),
        listMyStudents(),
        getCompetitionRegistrations(competitionId)
      ]);

      const assignedStudents = unwrapStudents(studentsResponse);
      const registeredStudents = unwrapRegistrations(registrationsResponse).map(normalizeRegisteredStudent);
      const byStudentId = new Map();
      for (const student of assignedStudents) {
        if (student?.studentId) {
          byStudentId.set(student.studentId, student);
        }
      }
      for (const student of registeredStudents) {
        if (student?.studentId) {
          byStudentId.set(student.studentId, { ...(byStudentId.get(student.studentId) || {}), ...student });
        }
      }

      setCompetition(competitionResponse?.data || null);
      setLevels(Array.isArray(levelsResponse?.data?.items) ? levelsResponse.data.items : []);
      setStudents([...byStudentId.values()]);
      setSelectedStudentIds([]);
      setSelectedLevels({});
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition registration workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [competitionId]);

  const canEdit = useMemo(() => {
    const now = new Date();
    const registrationStartsAt = competition?.registrationStartsAt ? new Date(competition.registrationStartsAt) : null;
    const registrationEndsAt = competition?.registrationEndsAt ? new Date(competition.registrationEndsAt) : null;
    const isOpen = (!registrationStartsAt || now >= registrationStartsAt) && (!registrationEndsAt || now <= registrationEndsAt);
    return Boolean(competition) && isOpen && String(competition?.workflowStage || "") === "APPROVED";
  }, [competition]);

  const toggleStudent = (studentId) => {
    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      return [...prev, studentId];
    });
  };

  const updateLevel = (studentId, levelId) => {
    setSelectedLevels((prev) => ({ ...prev, [studentId]: levelId }));
  };

  const enrollSelectedStudents = async () => {
    const selectedStudents = students.filter((student) => selectedStudentIds.includes(student.studentId) && !student.alreadyRegistered);
    for (const student of selectedStudents) {
      const levelId = selectedLevels[student.studentId] || student?.level?.id || "";
      if (!levelId) continue;
      await enrollCompetitionStudent({
        competitionId,
        studentId: student.studentId,
        competitionFeeAmount: 0,
        levelId
      });
    }
  };

  const saveDraft = async () => {
    if (!canEdit || saving) return;
    if (!selectedCount) {
      toast.error("Select at least one assigned student first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await enrollSelectedStudents();
      setDraftSaved(true);
      toast.success("Draft saved.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to save draft.");
    } finally {
      setSaving(false);
    }
  };

  const submitAndSync = async () => {
    if (!canEdit || saving) return;
    if (!selectedCount) {
      toast.error("Select at least one assigned student first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await enrollSelectedStudents();
      toast.success("Registration submitted and synced.");
      await loadData();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to submit registration.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading registration workspace..." />;
  }

  if (!competition) {
    return <EmptyState icon="!" title="Competition not found" description={error || "The selected competition could not be loaded."} />;
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
              Teacher Registration Workspace
            </div>
            <h2 style={{ margin: "4px 0 0" }}>Register Students</h2>
            <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>{competition.title || "-"}</div>
          </div>
          <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
            Back
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Assigned Students</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{students.length}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Selected</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{selectedCount}</div>
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Available Levels</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{levels.length}</div>
          </div>
        </div>

        {!canEdit ? (
          <div className="card" style={{ padding: 12, color: "var(--color-text-muted)" }}>
            Registration is currently closed or not yet available for this competition.
          </div>
        ) : null}

        {canEdit && !hasStudents ? (
          <div className="card" style={{ padding: 12, color: "var(--color-text-muted)" }}>
            No assigned students are currently available for this teacher. Assign students to Teacher One before using teacher competition registration.
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" onClick={() => void loadData()} disabled={saving} style={{ width: "auto" }}>
            Refresh
          </button>
          <button className="button secondary" type="button" onClick={() => void saveDraft()} disabled={!canEdit || saving || !selectedCount} style={{ width: "auto" }}>
            {saving ? "Saving..." : "Save Draft"}
          </button>
          <button className="button" type="button" onClick={() => void submitAndSync()} disabled={!canEdit || saving || !selectedCount} style={{ width: "auto" }}>
            {saving ? "Submitting..." : "Submit / Sync"}
          </button>
          {draftSaved ? <span style={{ color: "var(--color-text-success)", fontWeight: 700 }}>Draft saved</span> : null}
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--color-border)" }}>
                <th style={{ padding: 10 }}>Select</th>
                <th style={{ padding: 10 }}>Student</th>
                <th style={{ padding: 10 }}>Level</th>
              </tr>
            </thead>
            <tbody>
              {students.length ? (
                students.map((student) => (
                  <tr key={student.studentId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td style={{ padding: 10 }}>
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student.studentId)}
                        onChange={() => toggleStudent(student.studentId)}
                        disabled={!canEdit || student.alreadyRegistered}
                      />
                    </td>
                    <td style={{ padding: 10 }}>
                      <div>{student.fullName || student.studentName || "-"}</div>
                      {student.alreadyRegistered ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Already registered</div> : null}
                    </td>
                    <td style={{ padding: 10 }}>
                      <select
                        className="input"
                        value={selectedLevels[student.studentId] || student?.level?.id || ""}
                        onChange={(event) => updateLevel(student.studentId, event.target.value)}
                        disabled={!canEdit || student.alreadyRegistered}
                      >
                        <option value="">Select level</option>
                        {levels.map((level) => (
                          <option key={level.id} value={level.id}>
                            {level.name} / {level.rank}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>
                    No assigned students are available for this teacher.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export { TeacherCompetitionRegistrationPage };
