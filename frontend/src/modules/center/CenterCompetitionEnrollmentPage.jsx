import { useEffect, useState } from "react";
import { LoadingState } from "../../components/LoadingState";
import { listCompetitions, enrollCompetitionStudent } from "../../services/competitionsService";
import { listStudents } from "../../services/studentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function CenterCompetitionEnrollmentPage() {
  const [competitions, setCompetitions] = useState([]);
  const [students, setStudents] = useState([]);
  const [competitionId, setCompetitionId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [competitionFeeAmount, setCompetitionFeeAmount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [compRes, stuRes] = await Promise.all([
        listCompetitions({ limit: 50, offset: 0 }),
        listStudents({ limit: 100, offset: 0 })
      ]);

      setCompetitions(compRes.data.items || compRes.data || []);
      setStudents(stuRes?.data?.items || stuRes?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competitions/students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const onEnroll = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    if (!competitionId || !studentId) {
      setError("competitionId and studentId are required");
      return;
    }

    setSubmitting(true);
    try {
      await enrollCompetitionStudent({
        competitionId,
        studentId,
        competitionFeeAmount
      });
      setSuccess("Student enrolled.");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Enrollment failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading enrollment..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Competition Enrollment</h2>

      <form className="card" onSubmit={onEnroll} style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        {error ? <p className="error">{error}</p> : null}
        {success ? <p style={{ color: "var(--color-text-success)", fontWeight: 700 }}>{success}</p> : null}

        <label>
          Competition
          <select className="select" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
            <option value="">Select</option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title} ({c.workflowStage})
              </option>
            ))}
          </select>
        </label>

        <label>
          Student
          <select className="select" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.admissionNo} - {s.firstName} {s.lastName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Competition fee amount
          <input className="input" value={competitionFeeAmount} onChange={(e) => setCompetitionFeeAmount(Number(e.target.value) || 0)} />
        </label>

        <button className="button" disabled={submitting} style={{ width: "auto" }}>
          {submitting ? "Enrolling..." : "Enroll"}
        </button>
      </form>
    </section>
  );
}

export { CenterCompetitionEnrollmentPage };
