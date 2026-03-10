import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getStudent } from "../../services/studentsService";
import { updateEnrollment } from "../../services/enrollmentsService";
import { listTeachers } from "../../services/teachersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function pickTeacherLabel(teacher) {
  if (!teacher) return "";
  return teacher.teacherProfile?.fullName || teacher.username || teacher.email || "";
}

function CenterStudentChangeTeacherPage() {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [student, setStudent] = useState(null);
  const [teachers, setTeachers] = useState([]);

  const [enrollmentId, setEnrollmentId] = useState("");
  const [currentTeacherLabel, setCurrentTeacherLabel] = useState("");
  const [nextTeacherId, setNextTeacherId] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const activeEnrollment = useMemo(() => {
    const list = student?.batchEnrollments || [];
    return list[0] || null;
  }, [student]);

  const load = async () => {
    if (!studentId) return;

    setLoading(true);
    setError("");
    try {
      const [studentRes, teachersRes] = await Promise.all([getStudent(studentId), listTeachers({ limit: 200, offset: 0 })]);
      const studentData = studentRes?.data || null;
      setStudent(studentData);
      setTeachers(teachersRes?.data?.items || teachersRes?.data || []);

      const enrollment = (studentData?.batchEnrollments || [])[0] || null;
      setEnrollmentId(enrollment?.id || "");

      const currentTeacher = enrollment?.assignedTeacher || studentData?.currentTeacher || null;
      setCurrentTeacherLabel(currentTeacher ? pickTeacherLabel(currentTeacher) : "(None)");
      setNextTeacherId(currentTeacher?.id || "");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load student.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const onSave = async (e) => {
    e.preventDefault();
    if (!enrollmentId) return;

    setSaving(true);
    setSaveError("");
    try {
      await updateEnrollment(enrollmentId, {
        assignedTeacherUserId: nextTeacherId ? nextTeacherId : null
      });
      navigate("/center/students");
    } catch (err) {
      setSaveError(getFriendlyErrorMessage(err) || "Failed to change teacher.");
    } finally {
      setSaving(false);
    }
  };

  const studentTitle = student ? `${student.firstName || ""} ${student.lastName || ""}`.trim() : "Student";

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Change Teacher</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{studentTitle}</div>
        </div>
        <Link className="button secondary" style={{ width: "auto" }} to="/center/students">
          Back to Students
        </Link>
      </div>

      {loading ? <p style={{ margin: 0 }}>Loading...</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {activeEnrollment ? (
        <form className="card" onSubmit={onSave} style={{ display: "grid", gap: 10 }}>
          {saveError ? <p className="error">{saveError}</p> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current Teacher</div>
              <div style={{ fontWeight: 800 }}>{currentTeacherLabel}</div>
            </div>

            <label>
              New Teacher
              <select className="select" value={nextTeacherId} onChange={(e) => setNextTeacherId(e.target.value)}>
                <option value="">(None)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {pickTeacherLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <button className="button" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : student ? (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <p style={{ margin: 0 }}>No active enrollment found for this student.</p>
          <div>
            <Link className="button secondary" style={{ width: "auto" }} to="/center/enrollments">
              Go to Enrollments
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export { CenterStudentChangeTeacherPage };
