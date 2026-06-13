import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveExam,
  cloneExam,
  createCompetition,
  createExam,
  createSubject,
  generateCertificates,
  generateExamPaper,
  generateResults,
  getCompetitionLeaderboard,
  getExamPlatformAudit,
  getExamPlatformDashboard,
  judgeCompetition,
  listCertificates,
  listCompetitions,
  listExams,
  listResults,
  listSubjects,
  publishCompetitionWinners,
  publishExam,
  registerCompetitionParticipant,
  reissueCertificate,
  updateSubject,
  deleteSubject,
  advanceCompetitionStage,
  previewExam
} from "../../services/examPlatformService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function SuperadminExamPlatformPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [audit, setAudit] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [competitions, setCompetitions] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [selectedCompetitionId, setSelectedCompetitionId] = useState("");
  const [results, setResults] = useState([]);
  const [certificates, setCertificates] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [previewPayload, setPreviewPayload] = useState(null);
  const [paperPayload, setPaperPayload] = useState(null);

  const [subjectForm, setSubjectForm] = useState({ name: "", code: "", description: "" });
  const [examForm, setExamForm] = useState({
    name: "",
    code: "",
    description: "",
    subjectId: "",
    levelId: "",
    durationMinutes: 60,
    totalMarks: 100,
    passingMarks: 35,
    selectionMode: "MIXED"
  });
  const [competitionForm, setCompetitionForm] = useState({
    name: "",
    code: "",
    description: "",
    subjectId: "",
    levelId: "",
    startsAt: "",
    endsAt: ""
  });

  const subjectOptions = useMemo(() => subjects.map((subject) => ({ value: subject.id, label: `${subject.name} (${subject.code})` })), [subjects]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [auditData, dashboardData, subjectData, examData, competitionData] = await Promise.all([
        getExamPlatformAudit(),
        getExamPlatformDashboard(),
        listSubjects(),
        listExams(),
        listCompetitions()
      ]);

      setAudit(auditData?.data || null);
      setDashboard(dashboardData?.data || null);
      setSubjects(subjectData?.data?.items || []);
      setExams(examData?.data?.items || []);
      setCompetitions(competitionData?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam platform workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  async function onCreateSubject(event) {
    event.preventDefault();
    setError("");
    try {
      await createSubject(subjectForm);
      setSubjectForm({ name: "", code: "", description: "" });
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create subject.");
    }
  }

  async function onArchiveSubject(subjectId) {
    setError("");
    try {
      await updateSubject(subjectId, { isArchived: true });
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to archive subject.");
    }
  }

  async function onDeleteSubject(subjectId) {
    setError("");
    try {
      await deleteSubject(subjectId);
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to delete subject.");
    }
  }

  async function onCreateExam(event) {
    event.preventDefault();
    setError("");
    try {
      await createExam({
        ...examForm,
        sections: [
          { sectionName: "Section A", questionCount: 10, sectionMarks: 30, selectionMode: examForm.selectionMode },
          { sectionName: "Section B", questionCount: 10, sectionMarks: 30, selectionMode: examForm.selectionMode },
          { sectionName: "Section C", questionCount: 10, sectionMarks: 40, selectionMode: examForm.selectionMode }
        ]
      });
      setExamForm((prev) => ({ ...prev, name: "", code: "", description: "" }));
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create exam.");
    }
  }

  async function onCreateCompetition(event) {
    event.preventDefault();
    setError("");
    try {
      await createCompetition(competitionForm);
      setCompetitionForm((prev) => ({ ...prev, name: "", code: "", description: "" }));
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create competition.");
    }
  }

  async function onGenerateResults() {
    if (!selectedExamId) {
      setError("Select an exam first.");
      return;
    }
    setError("");
    try {
      await generateResults(selectedExamId);
      const data = await listResults(selectedExamId);
      setResults(data?.data?.items || []);
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to generate results.");
    }
  }

  async function onLoadResults() {
    if (!selectedExamId) {
      setError("Select an exam first.");
      return;
    }
    setError("");
    try {
      const data = await listResults(selectedExamId);
      setResults(data?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load results.");
    }
  }

  async function onGenerateCertificates(type) {
    if (!selectedExamId) {
      setError("Select an exam first.");
      return;
    }
    setError("");
    try {
      await generateCertificates(selectedExamId, type);
      const data = await listCertificates(selectedExamId);
      setCertificates(data?.data?.items || []);
      await loadAll();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to generate certificates.");
    }
  }

  async function onLoadCertificates() {
    if (!selectedExamId) {
      setError("Select an exam first.");
      return;
    }
    setError("");
    try {
      const data = await listCertificates(selectedExamId);
      setCertificates(data?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load certificates.");
    }
  }

  async function onLoadLeaderboard() {
    if (!selectedCompetitionId) {
      setError("Select a competition first.");
      return;
    }
    setError("");
    try {
      const data = await getCompetitionLeaderboard(selectedCompetitionId);
      setLeaderboard(data?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load leaderboard.");
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Exam and Competition Platform</h2>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="button" type="button" onClick={() => void loadAll()} disabled={loading}>Refresh All</button>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Audit Snapshot</h3>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(audit || {}, null, 2)}</pre>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Dashboard Snapshot</h3>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(dashboard || {}, null, 2)}</pre>
      </div>

      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={onCreateSubject}>
        <h3 style={{ margin: 0 }}>Phase 2: Subject Management</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" placeholder="Name" value={subjectForm.name} onChange={(event) => setSubjectForm((prev) => ({ ...prev, name: event.target.value }))} required />
          <input className="input" placeholder="Code" value={subjectForm.code} onChange={(event) => setSubjectForm((prev) => ({ ...prev, code: event.target.value }))} />
          <input className="input" placeholder="Description" value={subjectForm.description} onChange={(event) => setSubjectForm((prev) => ({ ...prev, description: event.target.value }))} />
        </div>
        <button className="button" type="submit">Create Subject</button>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Name</th><th style={{ textAlign: "left" }}>Code</th><th style={{ textAlign: "left" }}>Actions</th></tr></thead>
          <tbody>
            {subjects.map((subject) => (
              <tr key={subject.id}>
                <td>{subject.name}</td>
                <td>{subject.code}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="button secondary" type="button" onClick={() => void onArchiveSubject(subject.id)}>Archive</button>
                  <button className="button secondary" type="button" onClick={() => void onDeleteSubject(subject.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </form>

      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={onCreateExam}>
        <h3 style={{ margin: 0 }}>Phase 3: Exam Builder</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" placeholder="Exam Name" value={examForm.name} onChange={(event) => setExamForm((prev) => ({ ...prev, name: event.target.value }))} required />
          <input className="input" placeholder="Code" value={examForm.code} onChange={(event) => setExamForm((prev) => ({ ...prev, code: event.target.value }))} />
          <select className="input" value={examForm.subjectId} onChange={(event) => setExamForm((prev) => ({ ...prev, subjectId: event.target.value }))}>
            <option value="">Select Subject</option>
            {subjectOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input className="input" placeholder="Level ID" value={examForm.levelId} onChange={(event) => setExamForm((prev) => ({ ...prev, levelId: event.target.value }))} />
          <input className="input" type="number" min="1" placeholder="Duration" value={examForm.durationMinutes} onChange={(event) => setExamForm((prev) => ({ ...prev, durationMinutes: Number(event.target.value) }))} />
          <input className="input" type="number" min="1" placeholder="Total Marks" value={examForm.totalMarks} onChange={(event) => setExamForm((prev) => ({ ...prev, totalMarks: Number(event.target.value) }))} />
          <input className="input" type="number" min="1" placeholder="Passing Marks" value={examForm.passingMarks} onChange={(event) => setExamForm((prev) => ({ ...prev, passingMarks: Number(event.target.value) }))} />
          <select className="input" value={examForm.selectionMode} onChange={(event) => setExamForm((prev) => ({ ...prev, selectionMode: event.target.value }))}>
            <option value="MANUAL">Manual</option>
            <option value="RANDOM">Random</option>
            <option value="MIXED">Mixed</option>
          </select>
        </div>
        <textarea className="input" rows={2} placeholder="Description" value={examForm.description} onChange={(event) => setExamForm((prev) => ({ ...prev, description: event.target.value }))} />
        <button className="button" type="submit">Create Exam</button>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Code</th><th style={{ textAlign: "left" }}>Name</th><th style={{ textAlign: "left" }}>Status</th><th style={{ textAlign: "left" }}>Actions</th></tr></thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>{exam.code}</td>
                <td>{exam.name}</td>
                <td>{exam.status}</td>
                <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" onClick={async () => { await publishExam(exam.id); await loadAll(); }}>Publish</button>
                  <button className="button secondary" type="button" onClick={async () => { await archiveExam(exam.id); await loadAll(); }}>Archive</button>
                  <button className="button secondary" type="button" onClick={async () => { await cloneExam(exam.id); await loadAll(); }}>Clone</button>
                  <button className="button secondary" type="button" onClick={async () => { const data = await previewExam(exam.id); setPreviewPayload(data?.data || null); }}>Preview</button>
                  <button className="button secondary" type="button" onClick={async () => { const data = await generateExamPaper(exam.id); setPaperPayload(data?.data || null); }}>Generate Paper</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {previewPayload ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(previewPayload, null, 2)}</pre> : null}
        {paperPayload ? <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(paperPayload, null, 2)}</pre> : null}
      </form>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Phase 6: Result Engine</h3>
        <select className="input" value={selectedExamId} onChange={(event) => setSelectedExamId(event.target.value)}>
          <option value="">Select Exam</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>{exam.name} ({exam.code})</option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" type="button" onClick={() => void onGenerateResults()}>Generate Results</button>
          <button className="button secondary" type="button" onClick={() => void onLoadResults()}>Load Results</button>
        </div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(results, null, 2)}</pre>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Phase 7: Certificate Engine</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button" type="button" onClick={() => void onGenerateCertificates("PARTICIPATION")}>Generate Participation</button>
          <button className="button" type="button" onClick={() => void onGenerateCertificates("ACHIEVEMENT")}>Generate Achievement</button>
          <button className="button" type="button" onClick={() => void onGenerateCertificates("MERIT")}>Generate Merit</button>
          <button className="button secondary" type="button" onClick={() => void onLoadCertificates()}>Load Certificates</button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr><th style={{ textAlign: "left" }}>Certificate No</th><th style={{ textAlign: "left" }}>Type</th><th style={{ textAlign: "left" }}>Version</th><th style={{ textAlign: "left" }}>Actions</th></tr></thead>
          <tbody>
            {certificates.map((cert) => (
              <tr key={cert.id}>
                <td>{cert.certificateNo}</td>
                <td>{cert.certificateType}</td>
                <td>{cert.issueVersion}</td>
                <td>
                  <button className="button secondary" type="button" onClick={async () => { await reissueCertificate(cert.id); await onLoadCertificates(); }}>Reissue</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" style={{ display: "grid", gap: 8 }} onSubmit={onCreateCompetition}>
        <h3 style={{ margin: 0 }}>Phase 8: Competition Builder</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" placeholder="Competition Name" value={competitionForm.name} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, name: event.target.value }))} required />
          <input className="input" placeholder="Code" value={competitionForm.code} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, code: event.target.value }))} />
          <select className="input" value={competitionForm.subjectId} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, subjectId: event.target.value }))}>
            <option value="">Select Subject</option>
            {subjectOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input className="input" placeholder="Level ID" value={competitionForm.levelId} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, levelId: event.target.value }))} />
          <input className="input" type="datetime-local" value={competitionForm.startsAt} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, startsAt: event.target.value }))} />
          <input className="input" type="datetime-local" value={competitionForm.endsAt} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, endsAt: event.target.value }))} />
        </div>
        <textarea className="input" rows={2} placeholder="Description" value={competitionForm.description} onChange={(event) => setCompetitionForm((prev) => ({ ...prev, description: event.target.value }))} />
        <button className="button" type="submit">Create Competition</button>

        <select className="input" value={selectedCompetitionId} onChange={(event) => setSelectedCompetitionId(event.target.value)}>
          <option value="">Select Competition</option>
          {competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>{competition.name} ({competition.code})</option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await advanceCompetitionStage(selectedCompetitionId, "QUALIFICATION"); await loadAll(); }}>Qualification</button>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await advanceCompetitionStage(selectedCompetitionId, "SEMI_FINAL"); await loadAll(); }}>Semi Final</button>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await advanceCompetitionStage(selectedCompetitionId, "FINAL"); await loadAll(); }}>Final</button>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await registerCompetitionParticipant(selectedCompetitionId, "demo-student"); await onLoadLeaderboard(); }}>Register Demo</button>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await judgeCompetition(selectedCompetitionId, [{ studentId: "demo-student", totalScore: 99 }]); await onLoadLeaderboard(); }}>Judge Demo</button>
          <button className="button secondary" type="button" onClick={async () => { if (!selectedCompetitionId) return; await publishCompetitionWinners(selectedCompetitionId); await onLoadLeaderboard(); }}>Publish Winners</button>
          <button className="button secondary" type="button" onClick={() => void onLoadLeaderboard()}>Load Leaderboard</button>
        </div>

        <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(leaderboard, null, 2)}</pre>
      </form>
    </section>
  );
}

export { SuperadminExamPlatformPage };
