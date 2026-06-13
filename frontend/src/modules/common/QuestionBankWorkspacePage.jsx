import { useCallback, useEffect, useMemo, useState } from "react";
import {
  archiveQuestion,
  bulkUploadQuestions,
  createQuestion,
  deleteQuestion,
  exportQuestionCsv,
  importQuestionCsv,
  listQuestionBank
} from "../../services/examPlatformService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "SHORT_ANSWER", "LONG_ANSWER", "ABACUS_PRACTICAL"];

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function QuestionBankWorkspacePage({ title }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [csvText, setCsvText] = useState("");
  const [bulkJson, setBulkJson] = useState("[]");

  const [filters, setFilters] = useState({
    levelId: "",
    subjectId: "",
    topic: "",
    tag: "",
    difficultyId: ""
  });

  const [form, setForm] = useState({
    levelId: "",
    subjectId: "",
    topic: "",
    questionType: "MCQ",
    questionText: "",
    answerText: "",
    options: [
      { optionLabel: "A", optionText: "", isCorrect: false },
      { optionLabel: "B", optionText: "", isCorrect: false },
      { optionLabel: "C", optionText: "", isCorrect: false },
      { optionLabel: "D", optionText: "", isCorrect: false }
    ]
  });

  const activeOptionRows = useMemo(() => {
    if (form.questionType !== "MCQ" && form.questionType !== "TRUE_FALSE") {
      return [];
    }
    return form.options;
  }, [form.questionType, form.options]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listQuestionBank(filters);
      setRows(data?.data?.items || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load question bank.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateQuestion(event) {
    event.preventDefault();
    setError("");
    try {
      await createQuestion({
        ...form,
        options: form.questionType === "MCQ" || form.questionType === "TRUE_FALSE" ? form.options : []
      });
      setForm((prev) => ({ ...prev, questionText: "", answerText: "" }));
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create question.");
    }
  }

  async function onArchiveQuestion(id) {
    setError("");
    try {
      await archiveQuestion(id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to archive question.");
    }
  }

  async function onDeleteQuestion(id) {
    setError("");
    try {
      await deleteQuestion(id);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to delete question.");
    }
  }

  async function onImportCsv() {
    setError("");
    try {
      await importQuestionCsv(csvText);
      setCsvText("");
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to import CSV.");
    }
  }

  async function onExportCsv() {
    setError("");
    try {
      const response = await exportQuestionCsv();
      downloadBlob(response.data, "question-bank-export.csv");
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  }

  async function onBulkUpload() {
    setError("");
    try {
      const items = JSON.parse(bulkJson);
      await bulkUploadQuestions(items);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to bulk upload.");
    }
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>{title}</h2>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Filters</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
          <input className="input" placeholder="Level ID" value={filters.levelId} onChange={(event) => setFilters((prev) => ({ ...prev, levelId: event.target.value }))} />
          <input className="input" placeholder="Subject ID" value={filters.subjectId} onChange={(event) => setFilters((prev) => ({ ...prev, subjectId: event.target.value }))} />
          <input className="input" placeholder="Topic" value={filters.topic} onChange={(event) => setFilters((prev) => ({ ...prev, topic: event.target.value }))} />
          <input className="input" placeholder="Difficulty ID" value={filters.difficultyId} onChange={(event) => setFilters((prev) => ({ ...prev, difficultyId: event.target.value }))} />
          <input className="input" placeholder="Tag" value={filters.tag} onChange={(event) => setFilters((prev) => ({ ...prev, tag: event.target.value }))} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
          <button className="button secondary" type="button" onClick={() => void onExportCsv()}>Export CSV</button>
        </div>
      </div>

      <form className="card" style={{ display: "grid", gap: 10 }} onSubmit={onCreateQuestion}>
        <h3 style={{ margin: 0 }}>Create Question</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <input className="input" placeholder="Level ID" value={form.levelId} onChange={(event) => setForm((prev) => ({ ...prev, levelId: event.target.value }))} />
          <input className="input" placeholder="Subject ID" value={form.subjectId} onChange={(event) => setForm((prev) => ({ ...prev, subjectId: event.target.value }))} />
          <input className="input" placeholder="Topic" value={form.topic} onChange={(event) => setForm((prev) => ({ ...prev, topic: event.target.value }))} />
          <select className="input" value={form.questionType} onChange={(event) => setForm((prev) => ({ ...prev, questionType: event.target.value }))}>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
        <textarea className="input" placeholder="Question text" value={form.questionText} onChange={(event) => setForm((prev) => ({ ...prev, questionText: event.target.value }))} rows={3} required />
        <textarea className="input" placeholder="Answer text" value={form.answerText} onChange={(event) => setForm((prev) => ({ ...prev, answerText: event.target.value }))} rows={2} />

        {activeOptionRows.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {activeOptionRows.map((option, index) => (
              <div key={`${option.optionLabel}-${index}`} style={{ display: "grid", gridTemplateColumns: "60px 1fr 90px", gap: 8 }}>
                <input className="input" value={option.optionLabel} onChange={(event) => setForm((prev) => {
                  const next = [...prev.options];
                  next[index] = { ...next[index], optionLabel: event.target.value };
                  return { ...prev, options: next };
                })} />
                <input className="input" value={option.optionText} onChange={(event) => setForm((prev) => {
                  const next = [...prev.options];
                  next[index] = { ...next[index], optionText: event.target.value };
                  return { ...prev, options: next };
                })} />
                <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={option.isCorrect} onChange={(event) => setForm((prev) => {
                    const next = [...prev.options];
                    next[index] = { ...next[index], isCorrect: event.target.checked };
                    return { ...prev, options: next };
                  })} />
                  Correct
                </label>
              </div>
            ))}
          </div>
        ) : null}

        <button className="button" type="submit">Create Question</button>
      </form>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Import CSV</h3>
        <textarea className="input" rows={6} value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="questionType,questionText,answerText,subjectId,levelId,topic" />
        <button className="button secondary" type="button" onClick={() => void onImportCsv()}>Import CSV</button>
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>Bulk Upload JSON</h3>
        <textarea className="input" rows={8} value={bulkJson} onChange={(event) => setBulkJson(event.target.value)} />
        <button className="button secondary" type="button" onClick={() => void onBulkUpload()}>Bulk Upload</button>
      </div>

      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ overflowX: "auto" }}>
        <h3 style={{ marginTop: 0 }}>Question List ({rows.length})</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Type</th>
              <th style={{ textAlign: "left" }}>Question</th>
              <th style={{ textAlign: "left" }}>Subject</th>
              <th style={{ textAlign: "left" }}>Topic</th>
              <th style={{ textAlign: "left" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.questionType}</td>
                <td>{row.questionText}</td>
                <td>{row.subjectName || row.subjectId || "-"}</td>
                <td>{row.topic || "-"}</td>
                <td style={{ display: "flex", gap: 6 }}>
                  <button className="button secondary" type="button" onClick={() => void onArchiveQuestion(row.id)}>Archive</button>
                  <button className="button secondary" type="button" onClick={() => void onDeleteQuestion(row.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export { QuestionBankWorkspacePage };
