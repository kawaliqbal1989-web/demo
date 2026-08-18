import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import {
  addCompetitionCourseLevel,
  archiveCompetitionCourse,
  restoreCompetitionCourse,
  archiveCompetitionQuestionBank,
  archiveCompetitionWorksheet,
  createCompetitionCourse,
  copyCompetitionResources,
  createCompetitionQuestionBank,
  createCompetitionQuestionBankQuestion,
  importCompetitionQuestionBankQuestions,
  updateCompetitionQuestionBankQuestion,
  removeCompetitionQuestionBankQuestion,
  createCompetitionWorksheet,
  buildCompetitionWorksheetFromQuestions,
  getCompetitionDetail,
  getCompetitionEnrollmentList,
  grantCompetitionExtraAttempt,
  listCompetitionCourseLevels,
  listCompetitionCourses,
  listCompetitionReuseSources,
  listCompetitionEnrollmentLists,
  listCompetitionQuotas,
  reprocessCompetitionQuota,
  listCompetitionQuestionBanks,
  listCompetitionQuestionBankQuestions,
  listCompetitionWorksheetAssignments,
  listCompetitionWorksheets,
  removeCompetitionCourseLevel,
  reorderCompetitionCourseLevels,
  replaceCompetitionWorksheetAssignments,
  updateCompetitionCourse,
  updateCompetitionSchedule,
  updateCompetitionQuestionBank,
  updateCompetitionQuota,
  updateCompetitionWorksheet
} from "../../services/competitionsService";
import { listBusinessPartners } from "../../services/businessPartnersService";
import { listLevels } from "../../services/levelsService";
import { listWorksheets } from "../../services/worksheetsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const TABS = [
  { id: "overview", label: "Competition Overview" },
  { id: "resource-library", label: "Resource Library" },
  { id: "courses", label: "Competition Courses" },
  { id: "question-banks", label: "Question Banks" },
  { id: "worksheets", label: "Worksheets" },
  { id: "business-partners", label: "BP Assignments" },
  { id: "enrollment", label: "Enrollment" },
  { id: "results", label: "Results" },
  { id: "rankings", label: "Rankings" },
  { id: "settings", label: "Settings" }
];

function payload(response) {
  return response?.data ?? response ?? null;
}

function items(response) {
  const value = payload(response);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  return [];
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function localDateTimeToIso(value) {
  const date = new Date(String(value || "").trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function displayUser(user) {
  return user?.email || user?.username || user?.name || "—";
}

function InfoGrid({ competition }) {
  const rows = [
    ["Competition Name", competition?.title],
    ["Competition Code", competition?.code],
    ["Season", competition?.season?.name || competition?.season?.code],
    ["Status", competition?.status, true],
    ["Enrollment Start", formatDateTime(competition?.enrollmentStartAt)],
    ["Enrollment End", formatDateTime(competition?.enrollmentEndAt)],
    ["Competition Start", formatDateTime(competition?.startsAt)],
    ["Competition End", formatDateTime(competition?.endsAt)],
    ["Created By", displayUser(competition?.createdBy)],
    ["Updated By", displayUser(competition?.updatedBy)],
    ["Created At", formatDateTime(competition?.createdAt)],
    ["Updated At", formatDateTime(competition?.updatedAt)]
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
      {rows.map(([label, value, badge]) => (
        <div key={label} className="card" style={{ padding: 14, boxShadow: "none" }}>
          <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginBottom: 6 }}>{label}</div>
          <div style={{ fontWeight: 700 }}>{badge ? <StatusBadge value={value} /> : value || "—"}</div>
        </div>
      ))}
    </div>
  );
}

function Placeholder({ title, message }) {
  return (
    <section className="card" style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <p style={{ marginBottom: 0, color: "var(--color-text-muted)" }}>{message}</p>
    </section>
  );
}

function CourseDialog({ open, course, saving, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", code: "", description: "" });

  useEffect(() => {
    if (!open) return;
    setForm({ name: course?.name || "", code: course?.code || "", description: course?.description || "" });
  }, [open, course]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    onSave({
      name: form.name.trim(),
      ...(course ? { code: form.code.trim() } : {}),
      description: form.description.trim() || null
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="modal-panel__title">{course ? "Edit Competition Course" : "Create Competition Course"}</h3>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-panel__body" style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Course Name</span>
              <input className="input" required maxLength={191} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            {course ? <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Course Code</span>
              <input className="input" required maxLength={191} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </label> : null}
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Description</span>
              <textarea className="input" rows={4} maxLength={191} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <div className="modal-panel__footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button" type="submit" disabled={saving || !form.name.trim() || (course && !form.code.trim())}>{saving ? "Saving…" : "Save Course"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function QuestionBankDialog({ open, questionBank, saving, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", code: "", description: "" });
  useEffect(() => {
    if (open) setForm({ name: questionBank?.name || "", code: questionBank?.code || "", description: questionBank?.description || "" });
  }, [open, questionBank]);
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header"><h3 className="modal-panel__title">{questionBank ? "Edit Question Bank" : "Create Question Bank"}</h3><button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button></div>
        <form onSubmit={(event) => { event.preventDefault(); onSave({ name: form.name.trim(), ...(questionBank ? { code: form.code.trim() } : {}), description: form.description.trim() || null }); }}>
          <div className="modal-panel__body" style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}><span style={{ fontWeight: 700 }}>Question Bank Name</span><input className="input" required maxLength={191} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            {questionBank ? <label style={{ display: "grid", gap: 6 }}><span style={{ fontWeight: 700 }}>Question Bank Code</span><input className="input" required maxLength={191} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} /></label> : null}
            <label style={{ display: "grid", gap: 6 }}><span style={{ fontWeight: 700 }}>Description</span><textarea className="input" rows={4} maxLength={191} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          </div>
          <div className="modal-panel__footer"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button" type="submit" disabled={saving || !form.name.trim() || (questionBank && !form.code.trim())}>{saving ? "Saving…" : "Save Question Bank"}</button></div>
        </form>
      </div>
    </div>
  );
}


function CompetitionQuestionDialog({ open, question, saving, onClose, onSave }) {
  const [form, setForm] = useState({
    prompt: "",
    difficulty: "EASY",
    operation: "ADD",
    numbers: ["", ""],
    operators: ["", "+"]
  });

  const normalizeCalculatedAnswer = (value) => {
    if (!Number.isFinite(value)) return null;
    const rounded = Number(value.toFixed(10));
    return Object.is(rounded, -0) ? 0 : rounded;
  };

  const computeCorrectAnswer = (operation, terms, operators) => {
    if (!Array.isArray(terms) || terms.length < 2) return null;
    const normalized = terms.map((item) => Number(item));
    if (!normalized.every((value) => Number.isFinite(value))) return null;

    if (operation === "MIX") {
      if (!Array.isArray(operators) || operators.length < terms.length) return null;
      let total = normalized[0];
      for (let index = 1; index < normalized.length; index += 1) {
        const operator = operators[index];
        if (operator === "ADD") total = total + normalized[index];
        else if (operator === "SUB") total = total - normalized[index];
        else if (operator === "MUL") total = total * normalized[index];
        else if (operator === "DIV") {
          if (normalized[index] === 0) return null;
          total = total / normalized[index];
        } else return null;
      }
      return normalizeCalculatedAnswer(total);
    }

    if (operation === "ADD") return normalizeCalculatedAnswer(normalized.reduce((total, value) => total + value, 0));
    if (operation === "SUB") return normalizeCalculatedAnswer(normalized.slice(1).reduce((total, value) => total - value, normalized[0]));
    if (operation === "MUL") return normalizeCalculatedAnswer(normalized.slice(1).reduce((total, value) => total * value, normalized[0]));
    if (operation === "DIV") {
      let current = normalized[0];
      for (let index = 1; index < normalized.length; index += 1) {
        const next = normalized[index];
        if (next === 0) return null;
        const divided = current / next;
        if (!Number.isFinite(divided)) return null;
        current = normalizeCalculatedAnswer(divided);
        if (current === null) return null;
      }
      return normalizeCalculatedAnswer(current);
    }
    return null;
  };

  const normalizeOperators = (operators, length) => Array.from(
    { length },
    (_, index) => {
      if (index === 0) return "";
      const value = operators?.[index];
      if (value === "+" || value === "ADD") return "ADD";
      if (value === "-" || value === "SUB") return "SUB";
      if (value === "x" || value === "X" || value === "*" || value === "×" || value === "MUL") return "MUL";
      if (value === "/" || value === "÷" || value === "DIV") return "DIV";
      return "ADD";
    }
  );

  useEffect(() => {
    if (!open) return;
    const source = question?.questionBank || question || {};
    let operands = source.operands && typeof source.operands === "object" ? source.operands : {};
    if (typeof source.operands === "string") {
      try {
        const parsed = JSON.parse(source.operands);
        operands = parsed && typeof parsed === "object" ? parsed : {};
      } catch {
        operands = {};
      }
    }
    const numbers = Array.isArray(operands.terms)
      ? operands.terms.map((value) => (value === null || value === undefined ? "" : String(value)))
      : [operands.a ?? "", operands.b ?? ""].map((value) => (value === null || value === undefined ? "" : String(value)));
    const operation = String(source.operation || "ADD").toUpperCase();
    setForm({
      prompt: source.prompt || "",
      difficulty: source.difficulty || "EASY",
      operation,
      numbers: numbers.length >= 2 ? numbers : ["", ""],
      operators: normalizeOperators(operands.operators, Math.max(numbers.length, 2))
    });
  }, [open, question]);

  const parsedNumbers = useMemo(() => form.numbers.map((value) => Number(value)), [form.numbers]);
  const calculatedAnswer = useMemo(
    () => computeCorrectAnswer(form.operation, parsedNumbers, form.operators),
    [form.operation, parsedNumbers, form.operators]
  );

  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 620 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="modal-panel__title">{question ? "Edit Competition Question" : "Add Competition Question"}</h3>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!form.prompt.trim()) {
              toast.error("Prompt / Name is required.");
              return;
            }
            if (form.numbers.length < 2) {
              toast.error("Please keep at least 2 numbers.");
              return;
            }
            if (!parsedNumbers.every((value) => Number.isFinite(value))) {
              toast.error("All numbers must be valid.");
              return;
            }
            if (calculatedAnswer === null) {
              toast.error("Invalid operation result. Division by zero is not allowed.");
              return;
            }
            const operands = {
              a: parsedNumbers[0],
              b: parsedNumbers[1],
              terms: parsedNumbers
            };
            if (form.operation === "MIX") operands.operators = form.operators;
            onSave({
              prompt: form.prompt.trim(),
              difficulty: form.difficulty,
              operation: form.operation,
              operands,
              correctAnswer: calculatedAnswer
            });
          }}
        >
          <div className="modal-panel__body" style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Prompt / Sum</span>
              <input className="input" required value={form.prompt} onChange={(event) => setForm((current) => ({ ...current, prompt: event.target.value }))} />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Difficulty</span>
                <select className="input" value={form.difficulty} onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value }))}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Operation</span>
                <select className="input" value={form.operation} onChange={(event) => setForm((current) => ({
                  ...current,
                  operation: event.target.value,
                  operators: event.target.value === "MIX"
                    ? normalizeOperators(current.operators, current.numbers.length)
                    : current.operators
                }))}>
                  <option value="ADD">ADD</option>
                  <option value="SUB">SUB</option>
                  <option value="MUL">MUL</option>
                  <option value="DIV">DIV</option>
                  <option value="MIX">MIX</option>
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Numbers</span>
              <div style={{ display: "grid", gap: 8 }}>
                {form.numbers.map((value, index) => (
                  <div key={`term-${index}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {form.operation === "MIX" && index > 0 ? (
                      <select className="input" style={{ width: 80 }} value={form.operators[index] || "ADD"} onChange={(event) => setForm((current) => {
                        const operators = normalizeOperators(current.operators, current.numbers.length);
                        operators[index] = event.target.value;
                        return { ...current, operators };
                      })}>
                        <option value="ADD">+</option><option value="SUB">−</option><option value="MUL">×</option><option value="DIV">÷</option>
                      </select>
                    ) : null}
                    <input className="input" type="number" value={value} onChange={(event) => setForm((current) => {
                      const numbers = [...current.numbers];
                      numbers[index] = event.target.value;
                      return { ...current, numbers };
                    })} placeholder={`Number ${index + 1}`} />
                    {form.numbers.length > 2 ? <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setForm((current) => {
                      const numbers = current.numbers.filter((_, itemIndex) => itemIndex !== index);
                      const operators = normalizeOperators(current.operators, numbers.length);
                      return { ...current, numbers, operators };
                    })}>Remove</button> : null}
                  </div>
                ))}
                <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => setForm((current) => ({ ...current, numbers: [...current.numbers, ""], operators: [...current.operators, "ADD"] }))}>Add Number</button>
              </div>
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Correct Answer (Auto-filled)</span>
              <input className="input" readOnly value={calculatedAnswer ?? ""} />
            </label>
          </div>
          <div className="modal-panel__footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button className="button" type="submit" disabled={saving || !form.prompt.trim() || form.numbers.length < 2 || !parsedNumbers.every((value) => Number.isFinite(value)) || calculatedAnswer === null}>
              {saving ? "Saving…" : question ? "Save Changes" : "Add Question"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



function CompetitionWorksheetBuilderDialog({
  open,
  questionBank,
  questions,
  loadingQuestions,
  saving,
  onClose,
  onRefreshQuestions,
  onSave
}) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    version: "1",
    difficulty: "MEDIUM",
    timeLimitSeconds: "600",
    isPublished: true
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState("");
  const [randomCount, setRandomCount] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({
      name: "",
      description: "",
      version: "1",
      difficulty: "MEDIUM",
      timeLimitSeconds: "600",
      isPublished: true
    });
    setSelectedIds([]);
    setSearch("");
    setDifficultyFilter("");
    setRandomCount("");
  }, [open, questionBank?.id]);

  if (!open) return null;

  const filteredQuestions = questions.filter((membership) => {
    const question = membership.questionBank || {};
    const q = search.trim().toLowerCase();
    if (q && !String(question.prompt || "").toLowerCase().includes(q)) return false;
    if (difficultyFilter && question.difficulty !== difficultyFilter) return false;
    return true;
  });

  const filteredIds = filteredQuestions
    .map((membership) => membership.questionBankId)
    .filter(Boolean);

  const toggleQuestion = (questionId) => {
    setSelectedIds((current) =>
      current.includes(questionId)
        ? current.filter((id) => id !== questionId)
        : [...current, questionId]
    );
  };

  const selectAllFiltered = () => {
    setSelectedIds((current) => [...new Set([...current, ...filteredIds])]);
  };

  const clearFiltered = () => {
    const filteredSet = new Set(filteredIds);
    setSelectedIds((current) => current.filter((id) => !filteredSet.has(id)));
  };

  const selectRandom = () => {
    const count = Number(randomCount);
    if (!Number.isInteger(count) || count < 1) {
      toast.error("Enter a positive number of questions.");
      return;
    }
    if (count > filteredIds.length) {
      toast.error(`Only ${filteredIds.length} filtered question(s) are available.`);
      return;
    }
    const shuffled = [...filteredIds];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    setSelectedIds(shuffled.slice(0, count));
  };

  const submit = (event) => {
    event.preventDefault();
    if (!selectedIds.length) {
      toast.error("Select at least one question.");
      return;
    }

    const version = Number(form.version);
    const timeLimitSeconds =
      form.timeLimitSeconds === "" ? null : Number(form.timeLimitSeconds);

    onSave({
      name: form.name.trim(),
      description: form.description.trim() || null,
      version,
      difficulty: form.difficulty,
      timeLimitSeconds,
      isPublished: form.isPublished,
      questionIds: selectedIds
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="modal-panel"
        style={{ maxWidth: 1050, width: "min(1050px, calc(100vw - 32px))" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-panel__header">
          <div>
            <h3 className="modal-panel__title">Build Worksheet — {questionBank?.name || "Question Bank"}</h3>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>
              Any number of questions can be selected. The Worksheet stores an exact snapshot of those selected questions.
            </div>
          </div>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-panel__body" style={{ display: "grid", gap: 16, maxHeight: "72vh", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Worksheet Name</span>
                <input className="input" required maxLength={191} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Version</span>
                <input className="input" type="number" min="1" step="1" required value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Worksheet Difficulty</span>
                <select className="input" value={form.difficulty} onChange={(event) => setForm((current) => ({ ...current, difficulty: event.target.value }))}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>Time Limit (seconds)</span>
                <input className="input" type="number" min="30" max="7200" step="1" value={form.timeLimitSeconds} onChange={(event) => setForm((current) => ({ ...current, timeLimitSeconds: event.target.value }))} />
              </label>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Description</span>
              <textarea className="input" rows={2} maxLength={191} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>

            <label className="card" style={{ boxShadow: "none", padding: 12, display: "flex", gap: 10, alignItems: "center" }}>
              <input type="checkbox" checked={form.isPublished} onChange={(event) => setForm((current) => ({ ...current, isPublished: event.target.checked }))} />
              <span>
                <strong>Publish immediately</strong>
                <span style={{ display: "block", color: "var(--color-text-muted)", fontSize: 12 }}>
                  Published Worksheets can immediately be assigned to Business Partners and used for Competition enrollment.
                </span>
              </span>
            </label>

            <div className="card" style={{ boxShadow: "none", padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <strong>Question Selection</strong>
                  <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 3 }}>
                    {selectedIds.length} selected · {questions.length} available
                  </div>
                </div>
                <button className="button secondary" type="button" disabled={loadingQuestions} onClick={onRefreshQuestions}>
                  Refresh Questions
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px", gap: 8 }}>
                <input className="input" placeholder="Search prompt…" value={search} onChange={(event) => setSearch(event.target.value)} />
                <select className="input" value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value)}>
                  <option value="">All difficulties</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button className="button secondary" type="button" onClick={selectAllFiltered}>Select All Filtered ({filteredIds.length})</button>
                <button className="button secondary" type="button" onClick={clearFiltered}>Clear Filtered</button>
                <input
                  className="input"
                  type="number"
                  min="1"
                  placeholder="Random count"
                  style={{ width: 150 }}
                  value={randomCount}
                  onChange={(event) => setRandomCount(event.target.value)}
                />
                <button className="button secondary" type="button" onClick={selectRandom}>Select Random</button>
              </div>

              <div style={{ overflowX: "auto", maxHeight: 330, overflowY: "auto" }}>
                <table className="data-table">
                  <thead><tr><th>Select</th><th>#</th><th>Prompt</th><th>Difficulty</th><th>Operation</th><th>Answer</th></tr></thead>
                  <tbody>
                    {loadingQuestions ? (
                      <tr><td colSpan={6} style={{ textAlign: "center" }}>Loading questions…</td></tr>
                    ) : filteredQuestions.length ? filteredQuestions.map((membership, index) => {
                      const question = membership.questionBank || {};
                      const questionId = membership.questionBankId;
                      return (
                        <tr key={questionId}>
                          <td><input type="checkbox" checked={selectedIds.includes(questionId)} onChange={() => toggleQuestion(questionId)} /></td>
                          <td>{index + 1}</td>
                          <td>{question.prompt || "—"}</td>
                          <td>{question.difficulty || "—"}</td>
                          <td>{question.operation || "—"}</td>
                          <td>{question.correctAnswer ?? "—"}</td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No questions match this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="modal-panel__footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button
              className="button"
              type="submit"
              disabled={
                saving ||
                loadingQuestions ||
                !form.name.trim() ||
                selectedIds.length === 0
              }
            >
              {saving ? "Building…" : `Create Worksheet (${selectedIds.length} questions)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


function WorksheetDialog({
  open,
  worksheet,
  saving,
  executableWorksheets,
  executableWorksheetsLoading,
  onClose,
  onRefreshExecutableWorksheets,
  onSave
}) {
  const [form, setForm] = useState({
    name: "",
    code: "",
    description: "",
    version: "1",
    worksheetId: ""
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      name: worksheet?.name || "",
      code: worksheet?.code || "",
      description: worksheet?.description || "",
      version: String(worksheet?.version ?? 1),
      worksheetId: worksheet?.worksheetId || ""
    });
  }, [open, worksheet]);

  if (!open) return null;

  const submit = (event) => {
    event.preventDefault();
    const version = Number(form.version);
    onSave({
      name: form.name.trim(),
      ...(worksheet ? { code: form.code.trim() } : {}),
      description: form.description.trim() || null,
      version,
      worksheetId: form.worksheetId
    });
  };

  const versionIsValid = Number.isInteger(Number(form.version)) && Number(form.version) > 0;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 560 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <h3 className="modal-panel__title">{worksheet ? "Edit Competition Worksheet" : "Create Competition Worksheet"}</h3>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={submit}>
          <div className="modal-panel__body" style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Worksheet Name</span>
              <input className="input" required maxLength={191} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            {worksheet ? <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Worksheet Code</span>
              <input className="input" required maxLength={191} value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} />
            </label> : null}
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Executable Worksheet</span>
              <select
                className="input"
                required
                value={form.worksheetId}
                disabled={executableWorksheetsLoading}
                onChange={(event) => setForm((current) => ({ ...current, worksheetId: event.target.value }))}
              >
                <option value="">
                  {executableWorksheetsLoading ? "Loading published worksheets…" : "Select published worksheet"}
                </option>
                {executableWorksheets.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title || item.id}
                  </option>
                ))}
              </select>
              <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                Only published ERP Worksheets from this Competition Level are available.
              </span>
              {!executableWorksheetsLoading && executableWorksheets.length === 0 ? (
                <div
                  className="card"
                  style={{
                    padding: 12,
                    boxShadow: "none",
                    display: "grid",
                    gap: 10
                  }}
                >
                  <div style={{ fontWeight: 700 }}>
                    No published executable Worksheet is available for this ERP Level.
                  </div>
                  <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                    Phase 1 now manages this Competition Question Bank's question pool here.
                    Phase 2 will build executable Worksheets directly from the selected Competition questions.
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={onRefreshExecutableWorksheets}
                    >
                      Refresh Published Worksheets
                    </button>
                  </div>
                </div>
              ) : null}
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Version</span>
              <input className="input" type="number" min="1" step="1" required value={form.version} onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} />
            </label>
            <label style={{ display: "grid", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>Description</span>
              <textarea className="input" rows={4} maxLength={191} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </label>
          </div>
          <div className="modal-panel__footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancel</button>
            <button
              className="button"
              type="submit"
              disabled={
                saving ||
                executableWorksheetsLoading ||
                !form.name.trim() ||
                (worksheet && !form.code.trim()) ||
                !form.worksheetId ||
                !versionIsValid
              }
            >
              {saving ? "Saving…" : "Save Worksheet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ReuseCompetitionResourcesDialog({
  open,
  sources,
  loading,
  saving,
  onClose,
  onSave
}) {
  const [sourceCompetitionId, setSourceCompetitionId] = useState("");
  const [sourceCourseIds, setSourceCourseIds] = useState([]);
  const [includeQuestionBanks, setIncludeQuestionBanks] = useState(true);
  const [includeWorksheets, setIncludeWorksheets] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSourceCompetitionId("");
    setSourceCourseIds([]);
    setIncludeQuestionBanks(true);
    setIncludeWorksheets(true);
  }, [open]);

  if (!open) return null;

  const selectedSource = sources.find(
    (entry) => entry.id === sourceCompetitionId
  );
  const sourceCourses = selectedSource?.competitionCourses || [];
  const toggleCourse = (courseId) => {
    setSourceCourseIds((current) =>
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    );
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 760 }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-panel__header">
          <div>
            <h3 className="modal-panel__title">Add From Previous Competition</h3>
            <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)" }}>
              Copies the selected setup only. Enrollments, BP assignments, results, and rankings are not copied.
            </p>
          </div>
          <button className="modal-panel__close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-panel__body" style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Previous Competition</span>
            <select
              className="input"
              value={sourceCompetitionId}
              disabled={loading || saving}
              onChange={(event) => {
                setSourceCompetitionId(event.target.value);
                setSourceCourseIds([]);
              }}
            >
              <option value="">{loading ? "Loading previous competitions…" : "Select previous competition"}</option>
              {sources.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title} {entry.code ? `(${entry.code})` : ""} — {entry.status}
                </option>
              ))}
            </select>
          </label>

          {sourceCompetitionId ? (
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <strong>Select Courses</strong>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  type="button"
                  onClick={() => setSourceCourseIds(
                    sourceCourseIds.length === sourceCourses.length
                      ? []
                      : sourceCourses.map((course) => course.id)
                  )}
                >
                  {sourceCourseIds.length === sourceCourses.length ? "Clear All" : "Select All"}
                </button>
              </div>
              <div className="card" style={{ padding: 12, boxShadow: "none", maxHeight: 280, overflowY: "auto" }}>
                {sourceCourses.length ? sourceCourses.map((course) => (
                  <label key={course.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 4px" }}>
                    <input
                      type="checkbox"
                      checked={sourceCourseIds.includes(course.id)}
                      onChange={() => toggleCourse(course.id)}
                    />
                    <span>
                      <strong>{course.name}</strong>
                      <span style={{ color: "var(--color-text-muted)" }}> — {course._count?.levels ?? 0} level(s)</span>
                    </span>
                  </label>
                )) : <span style={{ color: "var(--color-text-muted)" }}>No active Courses are available.</span>}
              </div>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={includeQuestionBanks}
                onChange={(event) => {
                  setIncludeQuestionBanks(event.target.checked);
                  if (!event.target.checked) setIncludeWorksheets(false);
                }}
              />
              Copy Question Banks and link their questions
            </label>
            <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={includeWorksheets}
                disabled={!includeQuestionBanks}
                onChange={(event) => setIncludeWorksheets(event.target.checked)}
              />
              Link existing published Worksheets
            </label>
          </div>
        </div>
        <div className="modal-panel__footer">
          <button className="button secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
          <button
            className="button"
            type="button"
            disabled={saving || !sourceCompetitionId || !sourceCourseIds.length}
            onClick={() => onSave({
              sourceCompetitionId,
              sourceCourseIds,
              includeQuestionBanks,
              includeWorksheets
            })}
          >
            {saving ? "Copying…" : `Copy ${sourceCourseIds.length || ""} Course${sourceCourseIds.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetitionResourceLibrary({
  currentCompetitionId,
  sources,
  loading,
  search,
  copyingCourseId,
  onSearchChange,
  onRefresh,
  onCopyCourse
}) {
  const query = search.trim().toLowerCase();
  const filteredSources = sources.filter((competition) => {
    if (!query) return true;
    const searchable = [
      competition.title,
      competition.code,
      competition.status,
      ...(competition.competitionCourses || []).flatMap((course) => [
        course.name,
        course.code,
        ...(course.levels || []).flatMap((courseLevel) => [
          courseLevel.level?.name,
          `level ${courseLevel.level?.rank ?? courseLevel.levelNumber}`,
          ...(courseLevel.questionBanks || []).flatMap((bank) => [
            bank.name,
            bank.code,
            ...(bank.worksheets || []).flatMap((worksheet) => [
              worksheet.name,
              worksheet.code,
              worksheet.worksheet?.title
            ])
          ])
        ])
      ])
    ].filter(Boolean).join(" ").toLowerCase();
    return searchable.includes(query);
  });

  return (
    <section className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Competition Resource Library</h2>
          <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
            Browse Courses, Levels, Question Banks, and Worksheets from every Competition.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={onRefresh} disabled={loading}>Refresh</button>
      </div>

      <input
        className="input"
        style={{ marginTop: 16, width: "100%" }}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search Competition, Course, Level, Question Bank, or Worksheet…"
      />

      <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
        {loading ? <LoadingState /> : filteredSources.length ? filteredSources.map((source) => {
          const isCurrent = source.id === currentCompetitionId;
          return (
            <article key={source.id} className="card" style={{ padding: 16, boxShadow: "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{source.title}</h3>
                  <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>
                    {source.code || "No code"} · <StatusBadge value={source.status} /> {isCurrent ? " · Current Competition" : ""}
                  </div>
                </div>
                <strong>{source.competitionCourses?.length || 0} Course(s)</strong>
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
                {(source.competitionCourses || []).map((course) => (
                  <details key={course.id} className="card" style={{ padding: 12, boxShadow: "none" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                      {course.name} ({course.code}) · {course.levels?.length || 0} Level(s)
                    </summary>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                      <button
                        className="button"
                        style={{ width: "auto" }}
                        type="button"
                        disabled={isCurrent || Boolean(copyingCourseId)}
                        onClick={() => onCopyCourse(source.id, course.id)}
                      >
                        {copyingCourseId === course.id ? "Copying…" : isCurrent ? "Already in Current Competition" : "Copy Full Course Setup"}
                      </button>
                    </div>
                    <div style={{ overflowX: "auto", marginTop: 10 }}>
                      <table className="data-table">
                        <thead><tr><th>Level</th><th>Question Bank</th><th>Questions</th><th>Worksheets</th></tr></thead>
                        <tbody>
                          {(course.levels || []).flatMap((courseLevel) => {
                            const banks = courseLevel.questionBanks || [];
                            if (!banks.length) {
                              return [<tr key={`${courseLevel.id}-empty`}><td>Level {courseLevel.level?.rank ?? courseLevel.levelNumber} — {courseLevel.level?.name || "—"}</td><td>—</td><td>0</td><td>—</td></tr>];
                            }
                            return banks.map((bank) => (
                              <tr key={bank.id}>
                                <td>Level {courseLevel.level?.rank ?? courseLevel.levelNumber} — {courseLevel.level?.name || "—"}</td>
                                <td>{bank.name} ({bank.code})</td>
                                <td>{bank._count?.questions ?? 0}</td>
                                <td>
                                  {(bank.worksheets || []).length
                                    ? bank.worksheets.map((worksheet) => `${worksheet.name} (${worksheet.code})${worksheet.worksheet?.isPublished ? "" : " — Unpublished"}`).join(", ")
                                    : "—"}
                                </td>
                              </tr>
                            ));
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </article>
          );
        }) : (
          <div style={{ textAlign: "center", color: "var(--color-text-muted)", padding: 24 }}>
            No Competition resources match this search.
          </div>
        )}
      </div>
    </section>
  );
}

function CompetitionScheduleSettings({ competition, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [form, setForm] = useState({
    enrollmentStartAt: "",
    enrollmentEndAt: "",
    startsAt: "",
    endsAt: "",
    reason: ""
  });

  const resetForm = useCallback(() => {
    setForm({
      enrollmentStartAt: toDateTimeLocal(competition?.enrollmentStartAt),
      enrollmentEndAt: toDateTimeLocal(competition?.enrollmentEndAt),
      startsAt: toDateTimeLocal(competition?.startsAt),
      endsAt: toDateTimeLocal(competition?.endsAt),
      reason: ""
    });
    setReviewing(false);
  }, [competition]);

  useEffect(() => {
    if (!editing) resetForm();
  }, [editing, resetForm]);

  const isCompleted = competition?.status === "COMPLETED";
  const isArchived = competition?.status === "ARCHIVED";
  const parsed = {
    enrollmentStartAt: isCompleted
      ? competition?.enrollmentStartAt
      : localDateTimeToIso(form.enrollmentStartAt),
    enrollmentEndAt: isCompleted
      ? competition?.enrollmentEndAt
      : localDateTimeToIso(form.enrollmentEndAt),
    startsAt: isCompleted
      ? competition?.startsAt
      : localDateTimeToIso(form.startsAt),
    endsAt: localDateTimeToIso(form.endsAt)
  };

  const review = () => {
    if (Object.values(parsed).some((value) => !value)) {
      toast.error("Enter all four schedule dates and times.");
      return;
    }
    if (new Date(parsed.enrollmentEndAt) <= new Date(parsed.enrollmentStartAt)) {
      toast.error("Enrollment End must be after Enrollment Start.");
      return;
    }
    if (new Date(parsed.endsAt) <= new Date(parsed.startsAt)) {
      toast.error("Competition End must be after Competition Start.");
      return;
    }
    if (new Date(parsed.enrollmentEndAt) > new Date(parsed.endsAt)) {
      toast.error("Enrollment End must be on or before Competition End.");
      return;
    }
    if (form.reason.trim().length < 5) {
      toast.error("Enter a correction reason of at least 5 characters.");
      return;
    }
    if (isCompleted && new Date(parsed.endsAt) <= new Date()) {
      toast.error("A completed Competition must be extended to a future date and time.");
      return;
    }
    setReviewing(true);
  };

  const submit = async () => {
    const success = await onSave({
      ...parsed,
      reason: form.reason.trim(),
      expectedUpdatedAt: competition.updatedAt
    });
    if (success) {
      setEditing(false);
      setReviewing(false);
    }
  };

  if (!editing) {
    return (
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Competition Schedule</h2>
            <p style={{ color: "var(--color-text-muted)" }}>
              Correct clerical mistakes in Enrollment and Competition dates.
            </p>
          </div>
          <button
            className="button"
            style={{ width: "auto" }}
            type="button"
            disabled={isArchived}
            onClick={() => {
              resetForm();
              setEditing(true);
            }}
          >
            {isArchived ? "Archived Schedule Locked" : isCompleted ? "Extend Competition End" : "Edit Schedule"}
          </button>
        </div>
        <InfoGrid competition={competition} />
        {isCompleted ? (
          <p style={{ marginBottom: 0, color: "var(--color-text-muted)" }}>
            Completed Competition: only Competition End can be extended. Extending it will reopen the Competition as ACTIVE. Existing attempts remain counted.
          </p>
        ) : null}
      </section>
    );
  }

  const fields = [
    ["Enrollment Start", "enrollmentStartAt"],
    ["Enrollment End", "enrollmentEndAt"],
    ["Competition Start", "startsAt"],
    ["Competition End", "endsAt"]
  ];

  return (
    <section className="card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0 }}>{isCompleted ? "Extend Completed Competition" : "Edit Competition Schedule"}</h2>
      {isCompleted ? (
        <div className="error" style={{ marginBottom: 14 }}>
          This will change the Competition status from COMPLETED to ACTIVE. Published results must be unpublished first. Attempts and submissions will not reset.
        </div>
      ) : competition?.status === "ACTIVE" ? (
        <div className="error" style={{ marginBottom: 14 }}>
          This Competition is ACTIVE. New dates immediately affect enrollment and Competition access.
        </div>
      ) : null}

      {!reviewing ? (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {fields.map(([label, key]) => (
              <label key={key} style={{ display: "grid", gap: 6 }}>
                <span style={{ fontWeight: 700 }}>{label}</span>
                <input
                  className="input"
                  type="datetime-local"
                  required
                  disabled={isCompleted && key !== "endsAt"}
                  value={form[key]}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Correction / Extension Reason</span>
            <textarea
              className="input"
              rows={3}
              maxLength={500}
              required
              value={form.reason}
              onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Explain the clerical correction or extension…"
            />
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="button secondary" type="button" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
            <button className="button" type="button" disabled={saving} onClick={review}>Review Changes</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Field</th><th>Current</th><th>New</th></tr></thead>
              <tbody>
                {fields.map(([label, key]) => (
                  <tr key={key}>
                    <td>{label}</td>
                    <td>{formatDateTime(competition?.[key])}</td>
                    <td>{formatDateTime(parsed[key])}</td>
                  </tr>
                ))}
                {isCompleted ? <tr><td>Status</td><td>COMPLETED</td><td>ACTIVE</td></tr> : null}
              </tbody>
            </table>
          </div>
          <div><strong>Reason:</strong> {form.reason.trim()}</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="button secondary" type="button" disabled={saving} onClick={() => setReviewing(false)}>Back</button>
            <button className="button" type="button" disabled={saving} onClick={() => void submit()}>{saving ? "Saving…" : isCompleted ? "Confirm Extension & Reopen" : "Confirm Schedule Update"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function SuperadminCompetitionPendingPage() {
  const { competitionId } = useParams();
  const [activeTab, setActiveTab] = useState("overview");
  const [courseWorkspace, setCourseWorkspace] = useState("courses");
  const [competition, setCompetition] = useState(null);
  const [courses, setCourses] = useState([]);
  const [courseTotal, setCourseTotal] = useState(0);
  const [levelsByCourse, setLevelsByCourse] = useState({});
  const [erpLevels, setErpLevels] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [courseDialog, setCourseDialog] = useState({ open: false, course: null });
  const [reuseDialogOpen, setReuseDialogOpen] = useState(false);
  const [reuseSources, setReuseSources] = useState([]);
  const [reuseSourcesLoading, setReuseSourcesLoading] = useState(false);
  const [resourceSearch, setResourceSearch] = useState("");
  const [copyingCourseId, setCopyingCourseId] = useState("");
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [levelIdToAdd, setLevelIdToAdd] = useState("");
  const [selectedCourseLevelId, setSelectedCourseLevelId] = useState("");
  const [questionBanks, setQuestionBanks] = useState([]);
  const [questionBanksLoading, setQuestionBanksLoading] = useState(false);
  const [questionBankDialog, setQuestionBankDialog] = useState({ open: false, questionBank: null });
  const [selectedQuestionBankId, setSelectedQuestionBankId] = useState("");
  const [questionsOpen, setQuestionsOpen] = useState(false);
  const [competitionQuestions, setCompetitionQuestions] = useState([]);
  const [competitionQuestionsTotal, setCompetitionQuestionsTotal] = useState(0);
  const [competitionQuestionsLoading, setCompetitionQuestionsLoading] = useState(false);
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionDifficulty, setQuestionDifficulty] = useState("");
  const [questionDialog, setQuestionDialog] = useState({ open: false, question: null });
  const [questionImporting, setQuestionImporting] = useState(false);
  const [questionRemoveTarget, setQuestionRemoveTarget] = useState(null);
  const questionImportInputRef = useRef(null);
  const [worksheets, setWorksheets] = useState([]);
  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheetDialog, setWorksheetDialog] = useState({ open: false, worksheet: null });
  const [worksheetBuilderOpen, setWorksheetBuilderOpen] = useState(false);
  const [worksheetBuilderQuestions, setWorksheetBuilderQuestions] = useState([]);
  const [worksheetBuilderQuestionsLoading, setWorksheetBuilderQuestionsLoading] = useState(false);
  const [selectedWorksheetId, setSelectedWorksheetId] = useState("");
  const [businessPartners, setBusinessPartners] = useState([]);
  const [assignedBusinessPartnerIds, setAssignedBusinessPartnerIds] = useState([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [assignmentsSaving, setAssignmentsSaving] = useState(false);
  const [executableWorksheets, setExecutableWorksheets] = useState([]);
  const [executableWorksheetsLoading, setExecutableWorksheetsLoading] = useState(false);
  const [enrollmentLists, setEnrollmentLists] = useState([]);
  const [enrollmentListsLoading, setEnrollmentListsLoading] = useState(false);
  const [selectedEnrollmentListId, setSelectedEnrollmentListId] = useState("");
  const [selectedEnrollmentList, setSelectedEnrollmentList] = useState(null);
  const [enrollmentDetailLoading, setEnrollmentDetailLoading] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState("");
  const [quotaRows, setQuotaRows] = useState([]);
  const [quotaDrafts, setQuotaDrafts] = useState({});
  const [quotaLoading, setQuotaLoading] = useState(false);
  const [quotaSavingId, setQuotaSavingId] = useState("");
  const [quotaReprocessingId, setQuotaReprocessingId] = useState("");
  const [extraAttemptEnrollmentId, setExtraAttemptEnrollmentId] = useState("");

  const enrollmentListsRequestIdRef = useRef(0);
  const enrollmentDetailRequestIdRef = useRef(0);
  const questionBanksRequestIdRef = useRef(0);
  const questionBanksScopeRef = useRef("");
  const worksheetsRequestIdRef = useRef(0);
  const assignmentsRequestIdRef = useRef(0);

  const loadCourseLevels = useCallback(async (courseList) => {
    const entries = await Promise.all(courseList.map(async (course) => {
      const response = await listCompetitionCourseLevels(competitionId, course.id);
      return [course.id, items(response)];
    }));
    const mapped = Object.fromEntries(entries);
    setLevelsByCourse(mapped);
    return mapped;
  }, [competitionId]);

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [detailResponse, courseResponse, levelResponse] = await Promise.all([
        getCompetitionDetail(competitionId),
        listCompetitionCourses(competitionId, { limit: 100, offset: 0 }),
        listLevels()
      ]);
      const detail = payload(detailResponse);
      const courseResult = payload(courseResponse) || {};
      const courseItems = Array.isArray(courseResult.items) ? courseResult.items : [];
      const tenantLevels = items(levelResponse)
        .filter((level) => Number(level.rank) >= 1 && Number(level.rank) <= 8)
        .sort((a, b) => Number(a.rank) - Number(b.rank));

      setCompetition(detail);
      setCourses(courseItems);
      setCourseTotal(Number(courseResult.total ?? courseItems.length));
      setErpLevels(tenantLevels);
      setSelectedCourseId((current) => current || courseItems.find((course) => course.isActive)?.id || courseItems[0]?.id || "");
      await loadCourseLevels(courseItems);
    } catch (requestError) {
      const message = getFriendlyErrorMessage(requestError) || "Failed to load Competition Workspace.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [competitionId, loadCourseLevels]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  const loadEnrollmentLists = useCallback(async ({
    preserveSelection = true,
    preferredListId = selectedEnrollmentListId
  } = {}) => {
    const requestId = ++enrollmentListsRequestIdRef.current;

    setEnrollmentListsLoading(true);
    setEnrollmentError("");
    try {
      const response = await listCompetitionEnrollmentLists(competitionId);
      if (requestId !== enrollmentListsRequestIdRef.current) return null;

      const listItems = items(response)
        .filter((entry) => entry?.type === "CENTER_COMBINED")
        .sort((left, right) => {
          const leftPriority =
            left?.status === "WAITING_FOR_QUOTA"
              ? 0
              : left?.status === "APPROVED"
                ? 1
                : 2;
          const rightPriority =
            right?.status === "WAITING_FOR_QUOTA"
              ? 0
              : right?.status === "APPROVED"
                ? 1
                : 2;
          if (leftPriority !== rightPriority) return leftPriority - rightPriority;
          return String(
            right?.forwardedAt || right?.submittedAt || ""
          ).localeCompare(
            String(left?.forwardedAt || left?.submittedAt || "")
          );
        });

      const nextSelectedListId =
        preserveSelection &&
        preferredListId &&
        listItems.some((entry) => entry.id === preferredListId)
          ? preferredListId
          : listItems.find(
              (entry) => entry.status === "WAITING_FOR_QUOTA"
            )?.id ||
            listItems[0]?.id ||
            "";

      setEnrollmentLists(listItems);
      setSelectedEnrollmentListId(nextSelectedListId);

      return {
        items: listItems,
        selectedListId: nextSelectedListId
      };
    } catch (requestError) {
      if (requestId !== enrollmentListsRequestIdRef.current) return null;

      setEnrollmentLists([]);
      setSelectedEnrollmentListId("");
      setSelectedEnrollmentList(null);
      setEnrollmentError(
        getFriendlyErrorMessage(requestError) ||
          "Unable to load Competition enrollment lists."
      );
      return { items: [], selectedListId: "" };
    } finally {
      if (requestId === enrollmentListsRequestIdRef.current) {
        setEnrollmentListsLoading(false);
      }
    }
  }, [competitionId, selectedEnrollmentListId]);

  const loadEnrollmentListDetail = useCallback(async (listId) => {
    const requestId = ++enrollmentDetailRequestIdRef.current;

    if (!listId) {
      setSelectedEnrollmentList(null);
      setEnrollmentDetailLoading(false);
      return null;
    }

    setEnrollmentDetailLoading(true);
    setEnrollmentError("");
    try {
      const response = await getCompetitionEnrollmentList(
        competitionId,
        listId
      );
      if (requestId !== enrollmentDetailRequestIdRef.current) return null;

      const detail = payload(response);
      setSelectedEnrollmentList(detail);
      return detail;
    } catch (requestError) {
      if (requestId !== enrollmentDetailRequestIdRef.current) return null;

      setSelectedEnrollmentList(null);
      setEnrollmentError(
        getFriendlyErrorMessage(requestError) ||
          "Unable to load this Competition enrollment list."
      );
      return null;
    } finally {
      if (requestId === enrollmentDetailRequestIdRef.current) {
        setEnrollmentDetailLoading(false);
      }
    }
  }, [competitionId]);

  useEffect(() => {
    if (activeTab === "enrollment") void loadEnrollmentLists();
  }, [activeTab, loadEnrollmentLists]);

  const loadQuotas = useCallback(async () => {
    setQuotaLoading(true);
    try {
      const response = await listCompetitionQuotas(competitionId);
      const rows = items(response);
      setQuotaRows(rows);
      setQuotaDrafts(Object.fromEntries(rows.map((row) => [row.businessPartnerId, {
        quotaLimit: String(row.quotaLimit ?? 0),
        reason: ""
      }])));
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Business Partner quotas.");
    } finally {
      setQuotaLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    if (activeTab === "enrollment") void loadQuotas();
  }, [activeTab, loadQuotas]);

  const saveQuota = async (businessPartnerId) => {
    const draft = quotaDrafts[businessPartnerId] || {};
    const quotaLimit = Number(draft.quotaLimit);
    const reason = String(draft.reason || "").trim();
    if (!Number.isInteger(quotaLimit) || quotaLimit < 0) {
      toast.error("Quota must be a non-negative whole number.");
      return;
    }
    if (!reason) {
      toast.error("Quota change reason is required.");
      return;
    }
    setQuotaSavingId(businessPartnerId);
    try {
      await updateCompetitionQuota({ competitionId, businessPartnerId, quotaLimit, reason });
      toast.success("Business Partner quota saved.");
      await Promise.all([loadQuotas(), refreshEnrollment()]);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to save quota.");
    } finally {
      setQuotaSavingId("");
    }
  };

  const reprocessWaitingLists = async (businessPartnerId) => {
    setQuotaReprocessingId(businessPartnerId);
    try {
      const response = await reprocessCompetitionQuota({ competitionId, businessPartnerId });
      const result = payload(response) || {};
      const approved = Number(result.approved || 0);
      const waiting = Number(result.waiting || 0);
      toast.success(`Reprocessed ${Number(result.processed || 0)} list(s): ${approved} approved, ${waiting} waiting.`);
      await Promise.all([loadQuotas(), refreshEnrollment()]);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to reprocess waiting lists.");
    } finally {
      setQuotaReprocessingId("");
    }
  };

  useEffect(() => {
    if (activeTab === "enrollment" && selectedEnrollmentListId) {
      void loadEnrollmentListDetail(selectedEnrollmentListId);
    } else if (!selectedEnrollmentListId) {
      setSelectedEnrollmentList(null);
    }
  }, [activeTab, selectedEnrollmentListId, loadEnrollmentListDetail]);

  const refreshEnrollment = async () => {
    const preferredListId = selectedEnrollmentListId;
    const result = await loadEnrollmentLists({
      preserveSelection: true,
      preferredListId
    });

    if (!result) return;

    if (result.selectedListId) {
      await loadEnrollmentListDetail(result.selectedListId);
    } else {
      enrollmentDetailRequestIdRef.current += 1;
      setSelectedEnrollmentList(null);
      setEnrollmentDetailLoading(false);
    }
  };

  const handleGrantExtraAttempt = async (enrollment) => {
    const enrollmentId = String(enrollment?.id || "").trim();
    if (!enrollmentId || !selectedEnrollmentListId) return;

    const reason = window.prompt(
      "Reason for granting one extra Competition attempt:"
    );
    if (reason === null) return;
    if (String(reason).trim().length < 3) {
      toast.error("Please enter a valid reason.");
      return;
    }

    setExtraAttemptEnrollmentId(enrollmentId);
    try {
      const response = await grantCompetitionExtraAttempt({
        competitionId,
        enrollmentId,
        reason: String(reason).trim()
      });
      const updated = payload(response);
      toast.success(
        `Extra attempt granted. Attempt limit is now ${updated?.attemptLimitOverride || "updated"}.`
      );
      await loadEnrollmentListDetail(selectedEnrollmentListId);
    } catch (requestError) {
      toast.error(
        getFriendlyErrorMessage(requestError) ||
          "Unable to grant the extra attempt."
      );
    } finally {
      setExtraAttemptEnrollmentId("");
    }
  };

  const loadQuestionBanks = useCallback(async (courseId, courseLevelId) => {
    const requestId = ++questionBanksRequestIdRef.current;
    const scope = `${courseId}:${courseLevelId}`;
    if (!courseId || !courseLevelId) {
      questionBanksScopeRef.current = "";
      setQuestionBanks([]);
      return;
    }
    setQuestionBanksLoading(true);
    try {
      const response = await listCompetitionQuestionBanks(competitionId, courseId, courseLevelId, { limit: 100, offset: 0 });
      if (requestId !== questionBanksRequestIdRef.current) return;
      questionBanksScopeRef.current = scope;
      setQuestionBanks(items(response));
    } catch (requestError) {
      if (requestId !== questionBanksRequestIdRef.current) return;
      questionBanksScopeRef.current = "";
      setQuestionBanks([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Question Banks.");
    } finally {
      if (requestId === questionBanksRequestIdRef.current) setQuestionBanksLoading(false);
    }
  }, [competitionId]);

  const fetchAllCompetitionQuestions = useCallback(async (
    courseId,
    courseLevelId,
    questionBankId
  ) => {
    const pageSize = 200;
    const all = [];
    let offset = 0;

    while (true) {
      const response = await listCompetitionQuestionBankQuestions(
        competitionId,
        courseId,
        courseLevelId,
        questionBankId,
        { limit: pageSize, offset }
      );
      const result = payload(response) || {};
      const pageItems = Array.isArray(result.items) ? result.items : items(response);
      const total = Number(result.total ?? all.length + pageItems.length);

      all.push(...pageItems);
      offset += pageItems.length;

      if (!pageItems.length || all.length >= total) break;
    }

    return all;
  }, [competitionId]);

  const loadCompetitionQuestions = useCallback(async (
    courseId,
    courseLevelId,
    questionBankId,
    { q = questionSearch, difficulty = questionDifficulty } = {}
  ) => {
    if (!courseId || !courseLevelId || !questionBankId) {
      setCompetitionQuestions([]);
      setCompetitionQuestionsTotal(0);
      return;
    }
    setCompetitionQuestionsLoading(true);
    try {
      const all = await fetchAllCompetitionQuestions(
        courseId,
        courseLevelId,
        questionBankId
      );
      const normalizedQuery = String(q || "").trim().toLowerCase();
      const filtered = all.filter((membership) => {
        const question = membership.questionBank || {};
        if (
          normalizedQuery &&
          !String(question.prompt || "").toLowerCase().includes(normalizedQuery)
        ) {
          return false;
        }
        if (difficulty && question.difficulty !== difficulty) {
          return false;
        }
        return true;
      });
      setCompetitionQuestions(filtered);
      setCompetitionQuestionsTotal(all.length);
    } catch (requestError) {
      setCompetitionQuestions([]);
      setCompetitionQuestionsTotal(0);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Competition questions.");
    } finally {
      setCompetitionQuestionsLoading(false);
    }
  }, [fetchAllCompetitionQuestions, questionDifficulty, questionSearch]);

  const saveCompetitionQuestion = async (form) => {
    if (!selectedCourse || !selectedCourseLevel || !selectedQuestionBank) return;
    setSaving(true);
    try {
      const source = questionDialog.question?.questionBank || questionDialog.question;
      if (source?.id) {
        await updateCompetitionQuestionBankQuestion(
          competitionId,
          selectedCourse.id,
          selectedCourseLevel.id,
          selectedQuestionBank.id,
          source.id,
          form
        );
        toast.success("Competition question updated.");
      } else {
        await createCompetitionQuestionBankQuestion(
          competitionId,
          selectedCourse.id,
          selectedCourseLevel.id,
          selectedQuestionBank.id,
          form
        );
        toast.success("Competition question added.");
      }
      setQuestionDialog({ open: false, question: null });
      await loadCompetitionQuestions(
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id
      );
      await loadQuestionBanks(selectedCourse.id, selectedCourseLevel.id);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to save Competition question.");
    } finally {
      setSaving(false);
    }
  };

  const removeCompetitionQuestion = async () => {
    const source = questionRemoveTarget?.questionBank || questionRemoveTarget;
    if (!source?.id || !selectedCourse || !selectedCourseLevel || !selectedQuestionBank) return;
    setSaving(true);
    try {
      await removeCompetitionQuestionBankQuestion(
        competitionId,
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id,
        source.id
      );
      toast.success("Question removed from this Competition Question Bank.");
      setQuestionRemoveTarget(null);
      await loadCompetitionQuestions(
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id
      );
      await loadQuestionBanks(selectedCourse.id, selectedCourseLevel.id);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to remove Competition question.");
    } finally {
      setSaving(false);
    }
  };

  const importCompetitionQuestionsFromFile = async (file) => {
    if (!file || !selectedCourse || !selectedCourseLevel || !selectedQuestionBank) return;
    setQuestionImporting(true);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const questions = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.questions)
          ? parsed.questions
          : Array.isArray(parsed?.items)
            ? parsed.items
            : null;
      if (!questions?.length) {
        throw new Error("JSON must contain a non-empty questions array.");
      }
      const response = await importCompetitionQuestionBankQuestions(
        competitionId,
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id,
        questions
      );
      const result = payload(response) || {};
      toast.success(`${Number(result.importedCount ?? questions.length)} question(s) imported.`);
      await loadCompetitionQuestions(
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id
      );
      await loadQuestionBanks(selectedCourse.id, selectedCourseLevel.id);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || requestError?.message || "Unable to import questions.");
    } finally {
      setQuestionImporting(false);
      if (questionImportInputRef.current) questionImportInputRef.current.value = "";
    }
  };

  const loadWorksheetBuilderQuestions = useCallback(async () => {
    if (!selectedCourseId || !selectedCourseLevelId || !selectedQuestionBankId) {
      setWorksheetBuilderQuestions([]);
      return;
    }
    setWorksheetBuilderQuestionsLoading(true);
    try {
      const all = await fetchAllCompetitionQuestions(
        selectedCourseId,
        selectedCourseLevelId,
        selectedQuestionBankId
      );
      setWorksheetBuilderQuestions(all);
    } catch (requestError) {
      setWorksheetBuilderQuestions([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Worksheet question pool.");
    } finally {
      setWorksheetBuilderQuestionsLoading(false);
    }
  }, [
    fetchAllCompetitionQuestions,
    selectedCourseId,
    selectedCourseLevelId,
    selectedQuestionBankId
  ]);

  const buildWorksheet = async (form) => {
    if (!selectedCourse || !selectedCourseLevel || !selectedQuestionBank) return;
    setSaving(true);
    try {
      await buildCompetitionWorksheetFromQuestions(
        competitionId,
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id,
        form
      );
      toast.success(
        `Worksheet created with ${form.questionIds.length} question${form.questionIds.length === 1 ? "" : "s"}.`
      );
      setWorksheetBuilderOpen(false);
      await loadWorksheets(
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id
      );
      await loadExecutableWorksheets(selectedCourseLevel);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to build Competition Worksheet.");
    } finally {
      setSaving(false);
    }
  };

  const loadWorksheets = useCallback(async (courseId, courseLevelId, questionBankId) => {
    const requestId = ++worksheetsRequestIdRef.current;
    if (!courseId || !courseLevelId || !questionBankId) {
      setWorksheets([]);
      return;
    }
    setWorksheetsLoading(true);
    try {
      const response = await listCompetitionWorksheets(
        competitionId,
        courseId,
        courseLevelId,
        questionBankId,
        { limit: 100, offset: 0 }
      );
      if (requestId !== worksheetsRequestIdRef.current) return;
      setWorksheets(items(response));
    } catch (requestError) {
      if (requestId !== worksheetsRequestIdRef.current) return;
      setWorksheets([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Competition Worksheets.");
    } finally {
      if (requestId === worksheetsRequestIdRef.current) setWorksheetsLoading(false);
    }
  }, [competitionId]);


  const loadExecutableWorksheets = useCallback(async (courseLevel) => {
    const levelId = courseLevel?.levelId || courseLevel?.level?.id;
    if (!levelId) {
      setExecutableWorksheets([]);
      return;
    }

    setExecutableWorksheetsLoading(true);
    try {
      const response = await listWorksheets({
        levelId,
        published: true,
        limit: 100,
        offset: 0
      });
      setExecutableWorksheets(items(response));
    } catch (requestError) {
      setExecutableWorksheets([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load published ERP Worksheets.");
    } finally {
      setExecutableWorksheetsLoading(false);
    }
  }, []);


  const loadBusinessPartners = useCallback(async () => {
    try {
      const response = await listBusinessPartners({ limit: 100, offset: 0, status: "ACTIVE" });
      setBusinessPartners(items(response));
    } catch (requestError) {
      setBusinessPartners([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Business Partners.");
    }
  }, []);

  useEffect(() => { loadBusinessPartners(); }, [loadBusinessPartners]);

  const loadWorksheetAssignments = useCallback(async (
    courseId,
    courseLevelId,
    questionBankId,
    worksheetId
  ) => {
    const requestId = ++assignmentsRequestIdRef.current;
    if (!courseId || !courseLevelId || !questionBankId || !worksheetId) {
      setAssignedBusinessPartnerIds([]);
      setAssignmentsLoading(false);
      return;
    }
    setAssignmentsLoading(true);
    try {
      const response = await listCompetitionWorksheetAssignments(
        competitionId,
        courseId,
        courseLevelId,
        questionBankId,
        worksheetId
      );
      if (requestId !== assignmentsRequestIdRef.current) return;
      setAssignedBusinessPartnerIds(
        items(response).map((entry) => entry.businessPartnerId).filter(Boolean)
      );
    } catch (requestError) {
      if (requestId !== assignmentsRequestIdRef.current) return;
      setAssignedBusinessPartnerIds([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load Worksheet assignments.");
    } finally {
      if (requestId === assignmentsRequestIdRef.current) setAssignmentsLoading(false);
    }
  }, [competitionId]);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) || null;
  const selectedLevels = useMemo(
    () => levelsByCourse[selectedCourseId] || [],
    [levelsByCourse, selectedCourseId]
  );
  const selectedCourseLevel = selectedLevels.find((entry) => entry.id === selectedCourseLevelId) || null;

  useEffect(() => {
    loadExecutableWorksheets(selectedCourseLevel);
  }, [selectedCourseLevel, loadExecutableWorksheets]);

  useEffect(() => {
    if (!selectedLevels.length) { setSelectedCourseLevelId(""); setQuestionBanks([]); return; }
    setSelectedCourseLevelId((current) => selectedLevels.some((entry) => entry.id === current) ? current : selectedLevels[0].id);
  }, [selectedCourseId, selectedLevels]);
  useEffect(() => {
    questionBanksScopeRef.current = "";
    ++questionBanksRequestIdRef.current;
    ++worksheetsRequestIdRef.current;
    ++assignmentsRequestIdRef.current;
    setSelectedQuestionBankId("");
    setQuestionBanks([]);
    setSelectedWorksheetId("");
    setWorksheets([]);
    setAssignedBusinessPartnerIds([]);

    if (selectedCourseId && selectedCourseLevelId && selectedCourseLevel) {
      loadQuestionBanks(selectedCourseId, selectedCourseLevelId);
    }
  }, [selectedCourseId, selectedCourseLevelId, selectedCourseLevel, loadQuestionBanks]);

  useEffect(() => {
    if (!questionBanks.length) {
      setSelectedQuestionBankId("");
      setWorksheets([]);
      return;
    }
    setSelectedQuestionBankId((current) =>
      questionBanks.some((entry) => entry.id === current)
        ? current
        : questionBanks.find((entry) => entry.isActive !== false)?.id || questionBanks[0].id
    );
  }, [questionBanks]);

  const selectedQuestionBank = questionBanks.find((entry) => entry.id === selectedQuestionBankId) || null;
  const questionBankScopeIsCurrent =
    questionBanksScopeRef.current === `${selectedCourseId}:${selectedCourseLevelId}` &&
    Boolean(selectedQuestionBank);

  useEffect(() => {
    setCompetitionQuestions([]);
    setCompetitionQuestionsTotal(0);
    setQuestionSearch("");
    setQuestionDifficulty("");
    ++assignmentsRequestIdRef.current;
    setAssignmentsLoading(false);
    setAssignedBusinessPartnerIds([]);
  }, [selectedQuestionBankId]);

  useEffect(() => {
    if (questionsOpen && questionBankScopeIsCurrent) {
      void loadCompetitionQuestions(
        selectedCourseId,
        selectedCourseLevelId,
        selectedQuestionBankId
      );
    }
  }, [
    questionsOpen,
    selectedCourseId,
    selectedCourseLevelId,
    selectedQuestionBankId,
    questionBankScopeIsCurrent,
    loadCompetitionQuestions
  ]);

  useEffect(() => {
    if (questionBankScopeIsCurrent) {
      loadWorksheets(selectedCourseId, selectedCourseLevelId, selectedQuestionBankId);
    }
  }, [selectedCourseId, selectedCourseLevelId, selectedQuestionBankId, questionBankScopeIsCurrent, loadWorksheets]);


  useEffect(() => {
    if (!worksheets.length) {
      setSelectedWorksheetId("");
      setAssignedBusinessPartnerIds([]);
      return;
    }
    setSelectedWorksheetId((current) =>
      worksheets.some((entry) => entry.id === current)
        ? current
        : worksheets.find((entry) => entry.isActive !== false)?.id || worksheets[0].id
    );
  }, [worksheets]);

  const selectedWorksheet = worksheets.find((entry) => entry.id === selectedWorksheetId) || null;

  useEffect(() => {
    if (
      selectedCourseId &&
      selectedCourseLevelId &&
      questionBankScopeIsCurrent &&
      selectedWorksheetId
    ) {
      loadWorksheetAssignments(
        selectedCourseId,
        selectedCourseLevelId,
        selectedQuestionBankId,
        selectedWorksheetId
      );
    }
  }, [
    selectedCourseId,
    selectedCourseLevelId,
    selectedQuestionBankId,
    questionBankScopeIsCurrent,
    selectedWorksheetId,
    loadWorksheetAssignments
  ]);

  const usedLevelIds = new Set(selectedLevels.map((entry) => entry.levelId));
  const availableLevels = erpLevels.filter((level) => !usedLevelIds.has(level.id));
  const levelCount = Object.values(levelsByCourse).reduce((sum, levelItems) => sum + levelItems.length, 0);
  const counters = [
    ["Competition Courses", courseTotal],
    ["Levels", levelCount],
    ["Question Banks", questionBanks.length],
    ["Worksheets", worksheets.length],
    ["Business Partners Assigned", Number(competition?.businessPartnerCount ?? 0)],
    ["Students Enrolled", Number(competition?.approvedStudentCount ?? competition?.enrollments?.length ?? 0)]
  ];

  const saveCourse = async (form) => {
    setSaving(true);
    try {
      if (courseDialog.course) {
        await updateCompetitionCourse(competitionId, courseDialog.course.id, form);
        toast.success("Competition Course updated.");
      } else {
        await createCompetitionCourse(competitionId, form);
        toast.success("Competition Course created.");
      }
      setCourseDialog({ open: false, course: null });
      await loadWorkspace();
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to save Competition Course.");
    } finally {
      setSaving(false);
    }
  };

  const saveCompetitionSchedule = async (form) => {
    setSaving(true);
    try {
      const response = await updateCompetitionSchedule(competitionId, form);
      const updated = payload(response);
      toast.success(
        competition?.status === "COMPLETED"
          ? "Competition End extended and Competition reopened."
          : "Competition schedule updated."
      );
      if (updated) setCompetition(updated);
      await loadWorkspace();
      return true;
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to update Competition schedule.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const loadReuseSources = useCallback(async () => {
    setReuseSourcesLoading(true);
    try {
      const response = await listCompetitionReuseSources(competitionId);
      setReuseSources(items(response));
    } catch (requestError) {
      setReuseSources([]);
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to load previous Competitions.");
    } finally {
      setReuseSourcesLoading(false);
    }
  }, [competitionId]);

  const openReuseDialog = async () => {
    setReuseDialogOpen(true);
    await loadReuseSources();
  };

  useEffect(() => {
    if (activeTab === "resource-library") void loadReuseSources();
  }, [activeTab, loadReuseSources]);

  const reuseCompetitionResources = async (form) => {
    setSaving(true);
    try {
      const response = await copyCompetitionResources(competitionId, form);
      const summary = payload(response) || {};
      toast.success(
        `${summary.coursesCopied ?? form.sourceCourseIds.length} Course(s), ${summary.levelsCopied ?? 0} Level(s), ${summary.questionBanksCopied ?? 0} Question Bank(s), and ${summary.worksheetsLinked ?? 0} Worksheet(s) added.`
      );
      setReuseDialogOpen(false);
      await loadWorkspace();
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to copy Competition resources.");
    } finally {
      setSaving(false);
    }
  };

  const copyFullCourseSetup = async (sourceCompetitionId, sourceCourseId) => {
    setCopyingCourseId(sourceCourseId);
    try {
      const response = await copyCompetitionResources(competitionId, {
        sourceCompetitionId,
        sourceCourseIds: [sourceCourseId],
        includeQuestionBanks: true,
        includeWorksheets: true
      });
      const summary = payload(response) || {};
      toast.success(
        `Course copied with ${summary.levelsCopied ?? 0} Level(s), ${summary.questionBanksCopied ?? 0} Question Bank(s), and ${summary.worksheetsLinked ?? 0} Worksheet(s).`
      );
      await Promise.all([loadWorkspace(), loadReuseSources()]);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to copy this Course setup.");
    } finally {
      setCopyingCourseId("");
    }
  };

  const saveQuestionBank = async (form) => {
    if (!selectedCourse || !selectedCourseLevel) return;
    setSaving(true);
    try {
      if (questionBankDialog.questionBank) {
        await updateCompetitionQuestionBank(competitionId, selectedCourse.id, selectedCourseLevel.id, questionBankDialog.questionBank.id, form);
        toast.success("Question Bank updated.");
      } else {
        await createCompetitionQuestionBank(competitionId, selectedCourse.id, selectedCourseLevel.id, form);
        toast.success("Question Bank created.");
      }
      setQuestionBankDialog({ open: false, questionBank: null });
      await loadQuestionBanks(selectedCourse.id, selectedCourseLevel.id);
    } catch (requestError) { toast.error(getFriendlyErrorMessage(requestError) || "Unable to save Question Bank."); }
    finally { setSaving(false); }
  };

  const saveWorksheet = async (form) => {
    if (!selectedCourse || !selectedCourseLevel || !selectedQuestionBank) return;
    setSaving(true);
    try {
      if (worksheetDialog.worksheet) {
        await updateCompetitionWorksheet(
          competitionId,
          selectedCourse.id,
          selectedCourseLevel.id,
          selectedQuestionBank.id,
          worksheetDialog.worksheet.id,
          form
        );
        toast.success("Competition Worksheet updated.");
      } else {
        await createCompetitionWorksheet(
          competitionId,
          selectedCourse.id,
          selectedCourseLevel.id,
          selectedQuestionBank.id,
          form
        );
        toast.success("Competition Worksheet created.");
      }
      setWorksheetDialog({ open: false, worksheet: null });
      await loadWorksheets(selectedCourse.id, selectedCourseLevel.id, selectedQuestionBank.id);
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to save Competition Worksheet.");
    } finally {
      setSaving(false);
    }
  };


  const saveWorksheetAssignments = async () => {
    if (!selectedCourse || !selectedCourseLevel || !selectedQuestionBank || !selectedWorksheet) return;
    setAssignmentsSaving(true);
    try {
      const response = await replaceCompetitionWorksheetAssignments(
        competitionId,
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id,
        selectedWorksheet.id,
        assignedBusinessPartnerIds
      );
      toast.success(response?.message || "Worksheet assignments updated. Each selected Business Partner now has this single Worksheet for the Course Level.");
      await loadWorksheetAssignments(
        selectedCourse.id,
        selectedCourseLevel.id,
        selectedQuestionBank.id,
        selectedWorksheet.id
      );
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to update Worksheet assignments.");
    } finally {
      setAssignmentsSaving(false);
    }
  };

  const toggleBusinessPartnerAssignment = (businessPartnerId) => {
    setAssignedBusinessPartnerIds((current) =>
      current.includes(businessPartnerId)
        ? current.filter((id) => id !== businessPartnerId)
        : [...current, businessPartnerId]
    );
  };

  const confirmAction = async () => {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      if (confirmTarget.type === "course") {
        await archiveCompetitionCourse(competitionId, confirmTarget.course.id);
        toast.success("Competition Course archived.");
        setConfirmTarget(null);
        await loadWorkspace();
      } else if (confirmTarget.type === "restore-course") {
        await restoreCompetitionCourse(competitionId, confirmTarget.course.id);
        toast.success("Competition Course restored.");
        setConfirmTarget(null);
        await loadWorkspace();
      } else if (confirmTarget.type === "question-bank") {
        await archiveCompetitionQuestionBank(competitionId, confirmTarget.courseId, confirmTarget.courseLevelId, confirmTarget.questionBank.id);
        toast.success("Question Bank archived.");
        setConfirmTarget(null);
        await loadQuestionBanks(confirmTarget.courseId, confirmTarget.courseLevelId);
      } else if (confirmTarget.type === "worksheet") {
        await archiveCompetitionWorksheet(
          competitionId,
          confirmTarget.courseId,
          confirmTarget.courseLevelId,
          confirmTarget.questionBankId,
          confirmTarget.worksheet.id
        );
        toast.success("Competition Worksheet archived.");
        setConfirmTarget(null);
        await loadWorksheets(
          confirmTarget.courseId,
          confirmTarget.courseLevelId,
          confirmTarget.questionBankId
        );
      } else {
        await removeCompetitionCourseLevel(competitionId, confirmTarget.courseId, confirmTarget.level.id);
        toast.success("Competition Course Level removed.");
        setConfirmTarget(null);
        await loadWorkspace();
      }
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to complete action.");
    } finally {
      setSaving(false);
    }
  };

  const addLevel = async () => {
    if (!selectedCourse || !levelIdToAdd) return;
    setSaving(true);
    try {
      await addCompetitionCourseLevel(competitionId, selectedCourse.id, { levelId: levelIdToAdd });
      setLevelIdToAdd("");
      toast.success("ERP Level added.");
      await loadWorkspace();
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to add ERP Level.");
    } finally {
      setSaving(false);
    }
  };

  const moveLevel = async (index, direction) => {
    const nextIndex = index + direction;
    if (!selectedCourse || nextIndex < 0 || nextIndex >= selectedLevels.length) return;
    const reordered = [...selectedLevels];
    [reordered[index], reordered[nextIndex]] = [reordered[nextIndex], reordered[index]];
    setSaving(true);
    try {
      await reorderCompetitionCourseLevels(competitionId, selectedCourse.id, reordered.map((entry) => entry.id));
      setLevelsByCourse((current) => ({ ...current, [selectedCourse.id]: reordered }));
      toast.success("Level order updated.");
    } catch (requestError) {
      toast.error(getFriendlyErrorMessage(requestError) || "Unable to reorder Levels.");
    } finally {
      setSaving(false);
    }
  };

  const enrollmentPendingCount = useMemo(() => enrollmentLists.filter((entry) => entry?.status === "WAITING_FOR_QUOTA").length, [enrollmentLists]);
  const enrollmentApprovedCount = useMemo(() => enrollmentLists.filter((entry) => entry?.status === "APPROVED").length, [enrollmentLists]);
  const quotaByBusinessPartnerId = useMemo(
    () => new Map(quotaRows.map((row) => [row.businessPartnerId, row])),
    [quotaRows]
  );
  const selectedEnrollmentItems = Array.isArray(selectedEnrollmentList?.items) ? selectedEnrollmentList.items : [];

  const openWorkspaceTab = (tabId) => {
    setActiveTab(tabId);
    if (tabId === "courses") setCourseWorkspace("courses");
    if (tabId === "question-banks") setCourseWorkspace("question-banks");
    if (tabId === "worksheets") {
      setQuestionsOpen(false);
      setCourseWorkspace("question-bank");
    }
    if (tabId === "business-partners") setCourseWorkspace("assignments");
  };

  const goBackInContentWorkspace = () => {
    if (courseWorkspace === "assignments") {
      setActiveTab("worksheets");
      setCourseWorkspace("question-bank");
      return;
    }
    if (courseWorkspace === "question-bank") {
      setActiveTab("question-banks");
      setCourseWorkspace("question-banks");
      return;
    }
    if (courseWorkspace === "question-banks") {
      setActiveTab("courses");
      setCourseWorkspace("levels");
      return;
    }
    setActiveTab("courses");
    setCourseWorkspace("courses");
  };

  const courseColumns = useMemo(() => [
    { key: "code", header: "Code" },
    { key: "name", header: "Course" },
    { key: "levels", header: "Levels", render: (row) => (levelsByCourse[row.id] || []).length },
    { key: "status", header: "Status", render: (row) => <StatusBadge value={row.isActive ? "ACTIVE" : "ARCHIVED"} /> },
    {
      key: "actions",
      header: "Actions",
      render: (row) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="button secondary" type="button" onClick={() => { setSelectedCourseId(row.id); setActiveTab("courses"); setCourseWorkspace("levels"); }}>Manage Levels</button>
          <button className="button secondary" type="button" disabled={!row.isActive} onClick={() => setCourseDialog({ open: true, course: row })}>Edit</button>
          {row.isActive ? (
            <button className="button secondary" type="button" onClick={() => setConfirmTarget({ type: "course", course: row })}>Archive</button>
          ) : (
            <button className="button secondary" type="button" onClick={() => setConfirmTarget({ type: "restore-course", course: row })}>Restore</button>
          )}
        </div>
      )
    }
  ], [levelsByCourse]);

  if (loading) return <LoadingState label="Loading Competition Workspace…" />;

  return (
    <div className="page" style={{ display: "grid", gap: 16 }}>
      <section className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>Competition Workspace</div>
            <h1 style={{ margin: "4px 0" }}>{competition?.title || "Competition"}</h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><span>{competition?.code || "—"}</span><StatusBadge value={competition?.status} /></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="button secondary" type="button" onClick={loadWorkspace}>Refresh</button>
            <Link className="button secondary" to="/superadmin/competition">Back to Competitions</Link>
          </div>
        </div>
      </section>

      {error ? <div className="error">{error}</div> : null}

      <nav className="card" aria-label="Competition workspace tabs" style={{ padding: 10, display: "flex", gap: 8, overflowX: "auto" }}>
        {TABS.map((tab) => (
          <button key={tab.id} type="button" className={`button ${activeTab === tab.id ? "" : "secondary"}`} style={{ width: "auto", whiteSpace: "nowrap" }} onClick={() => (["courses", "question-banks", "worksheets", "business-partners"].includes(tab.id) ? openWorkspaceTab(tab.id) : setActiveTab(tab.id))}>{tab.label}</button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>Competition Overview</h2><InfoGrid competition={competition} /></section>
          <section className="card" style={{ padding: 20 }}>
            <h2 style={{ marginTop: 0 }}>Workspace Counters</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
              {counters.map(([label, value]) => <div key={label} className="card" style={{ padding: 16, boxShadow: "none" }}><div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{value}</div></div>)}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "resource-library" ? (
        <CompetitionResourceLibrary
          currentCompetitionId={competitionId}
          sources={reuseSources}
          loading={reuseSourcesLoading}
          search={resourceSearch}
          copyingCourseId={copyingCourseId}
          onSearchChange={setResourceSearch}
          onRefresh={() => void loadReuseSources()}
          onCopyCourse={copyFullCourseSetup}
        />
      ) : null}

      {["courses", "question-banks", "worksheets", "business-partners"].includes(activeTab) ? (
        <div style={{ display: "grid", gap: 16 }}>
          {courseWorkspace !== "courses" ? (
            <section className="card" style={{ padding: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="button secondary" type="button" onClick={() => setCourseWorkspace("courses")}>Courses</button>
              {selectedCourse ? <span>› {selectedCourse.name}</span> : null}
              {selectedCourseLevel && ["question-banks", "question-bank", "assignments"].includes(courseWorkspace) ? <span>› Level {selectedCourseLevel.level?.rank ?? selectedCourseLevel.levelNumber}</span> : null}
              {selectedQuestionBank && ["question-bank", "assignments"].includes(courseWorkspace) ? <span>› {selectedQuestionBank.name}</span> : null}
              {selectedWorksheet && courseWorkspace === "assignments" ? <span>› {selectedWorksheet.name}</span> : null}
              <button
                className="button secondary"
                style={{ marginLeft: "auto" }}
                type="button"
                onClick={goBackInContentWorkspace}
              >
                Back
              </button>
            </section>
          ) : null}

          {courseWorkspace === "courses" ? <section className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div><h2 style={{ margin: 0 }}>Competition Courses</h2><p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>Competition-specific courses, independent from ERP Courses.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" onClick={() => void openReuseDialog()}>Add From Previous Competition</button>
                <button className="button" type="button" onClick={() => setCourseDialog({ open: true, course: null })}>Create New Course</button>
              </div>
            </div>
            <div style={{ marginTop: 16 }}><DataTable columns={courseColumns} rows={courses} searchable searchPlaceholder="Search Competition Courses…" emptyMessage="No Competition Courses yet." /></div>
          </section> : null}

          {selectedCourse && courseWorkspace === "levels" ? (
            <section className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><h2 style={{ margin: 0 }}>Course Levels — {selectedCourse.name}</h2><p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>Reuse ERP Levels 1–8. No duplicate Levels are created.</p></div>
                {selectedCourse.isActive ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select className="input" value={levelIdToAdd} onChange={(event) => setLevelIdToAdd(event.target.value)}><option value="">Select ERP Level</option>{availableLevels.map((level) => <option key={level.id} value={level.id}>Level {level.rank} — {level.name}</option>)}</select>
                    <button className="button" type="button" disabled={!levelIdToAdd || saving} onClick={addLevel}>Add Level</button>
                  </div>
                ) : null}
              </div>
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="data-table">
                  <thead><tr><th>Order</th><th>ERP Level</th><th>Name</th><th>Actions</th></tr></thead>
                  <tbody>
                    {selectedLevels.length ? selectedLevels.map((entry, index) => (
                      <tr key={entry.id}><td>{index + 1}</td><td>Level {entry.level?.rank ?? entry.levelNumber}</td><td>{entry.level?.name || "—"}</td><td><div style={{ display: "flex", gap: 8 }}><button className="button secondary" type="button" onClick={() => { setSelectedCourseLevelId(entry.id); setActiveTab("question-banks"); setCourseWorkspace("question-banks"); }}>Question Banks</button><button className="button secondary" type="button" disabled={saving || index === 0 || !selectedCourse.isActive} onClick={() => moveLevel(index, -1)}>↑</button><button className="button secondary" type="button" disabled={saving || index === selectedLevels.length - 1 || !selectedCourse.isActive} onClick={() => moveLevel(index, 1)}>↓</button><button className="button secondary" type="button" disabled={saving || !selectedCourse.isActive} onClick={() => setConfirmTarget({ type: "level", courseId: selectedCourse.id, level: entry })}>Remove</button></div></td></tr>
                    )) : <tr><td colSpan={4} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No Levels added.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedCourse && selectedCourseLevel && courseWorkspace === "question-banks" ? (
            <section className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>
                    Question Banks — {selectedCourse.name} / Level {selectedCourseLevel.level?.rank ?? selectedCourseLevel.levelNumber}
                  </h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
                    Competition Question Banks own a scoped question pool for this Competition Course Level.
                    Build and manage the question pool here, then create Worksheets from these questions.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {selectedCourse.isActive ? (
                    <button
                      className="button"
                      type="button"
                      onClick={() => setQuestionBankDialog({ open: true, questionBank: null })}
                    >
                      Create Question Bank
                    </button>
                  ) : null}
                </div>
              </div>
              <div style={{ overflowX: "auto", marginTop: 16 }}><table className="data-table"><thead><tr><th>Code</th><th>Name</th><th>Questions</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                {questionBanksLoading ? <tr><td colSpan={6} style={{ textAlign: "center" }}>Loading Question Banks…</td></tr> : questionBanks.length ? questionBanks.map((questionBank) => (
                  <tr key={questionBank.id}><td>{questionBank.code}</td><td>{questionBank.name}</td><td>{questionBank._count?.questions ?? 0}</td><td>{questionBank.description || "—"}</td><td><StatusBadge value={questionBank.isActive === false ? "ARCHIVED" : (questionBank.status || "ACTIVE")} /></td><td><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="button secondary" type="button" onClick={() => { setSelectedQuestionBankId(questionBank.id); setQuestionsOpen(true); setActiveTab("question-banks"); setCourseWorkspace("question-bank"); }}>Manage Questions</button><button className="button secondary" type="button" onClick={() => { setSelectedQuestionBankId(questionBank.id); setQuestionsOpen(false); setActiveTab("worksheets"); setCourseWorkspace("question-bank"); }}>Worksheets</button><button className="button secondary" type="button" disabled={saving || questionBank.isActive === false || !selectedCourse.isActive} onClick={() => setQuestionBankDialog({ open: true, questionBank })}>Edit</button><button className="button secondary" type="button" disabled={saving || questionBank.isActive === false || !selectedCourse.isActive} onClick={() => setConfirmTarget({ type: "question-bank", courseId: selectedCourse.id, courseLevelId: selectedCourseLevel.id, questionBank })}>Archive</button></div></td></tr>
                )) : <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No Question Banks yet for this Level.</td></tr>}
              </tbody></table></div>
            </section>
          ) : null}

          {selectedCourse && selectedCourseLevel && selectedQuestionBank && courseWorkspace === "question-bank" ? (
            <section className="card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={`button ${questionsOpen ? "" : "secondary"}`} type="button" onClick={() => setQuestionsOpen(true)}>Questions</button>
              <button className={`button ${questionsOpen ? "secondary" : ""}`} type="button" onClick={() => setQuestionsOpen(false)}>Worksheets</button>
            </section>
          ) : null}

          {selectedCourse && selectedCourseLevel && selectedQuestionBank && courseWorkspace === "question-bank" && questionsOpen ? (
            <section className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Questions — {selectedQuestionBank.name}</h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
                    {selectedCourse.name} / Level {selectedCourseLevel.level?.rank ?? selectedCourseLevel.levelNumber} / {selectedQuestionBank.code}
                    {" · "}{competitionQuestionsTotal} question{competitionQuestionsTotal === 1 ? "" : "s"}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input
                    ref={questionImportInputRef}
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={(event) => void importCompetitionQuestionsFromFile(event.target.files?.[0])}
                  />
                  <button
                    className="button secondary"
                    type="button"
                    disabled={questionImporting || selectedQuestionBank.isActive === false}
                    onClick={() => questionImportInputRef.current?.click()}
                  >
                    {questionImporting ? "Importing…" : "Import JSON"}
                  </button>
                  <button
                    className="button"
                    type="button"
                    disabled={selectedQuestionBank.isActive === false}
                    onClick={() => setQuestionDialog({ open: true, question: null })}
                  >
                    Add Question
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                <input
                  className="input"
                  style={{ minWidth: 240, flex: 1 }}
                  placeholder="Search prompt…"
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                />
                <select className="input" value={questionDifficulty} onChange={(event) => setQuestionDifficulty(event.target.value)}>
                  <option value="">All difficulties</option>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
                </select>
                <button
                  className="button secondary"
                  type="button"
                  disabled={competitionQuestionsLoading}
                  onClick={() => void loadCompetitionQuestions(selectedCourse.id, selectedCourseLevel.id, selectedQuestionBank.id)}
                >
                  Apply Filters
                </button>
              </div>

              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="data-table">
                  <thead>
                    <tr><th>#</th><th>Prompt</th><th>Difficulty</th><th>Operation</th><th>Answer</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {competitionQuestionsLoading ? (
                      <tr><td colSpan={6} style={{ textAlign: "center" }}>Loading questions…</td></tr>
                    ) : competitionQuestions.length ? competitionQuestions.map((membership, index) => {
                      const question = membership.questionBank || {};
                      return (
                        <tr key={membership.questionBankId}>
                          <td>{index + 1}</td>
                          <td>{question.prompt || "—"}</td>
                          <td><StatusBadge value={question.difficulty || "EASY"} /></td>
                          <td>{question.operation || "—"}</td>
                          <td>{question.correctAnswer ?? "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              <button
                                className="button secondary"
                                type="button"
                                disabled={selectedQuestionBank.isActive === false}
                                onClick={() => setQuestionDialog({ open: true, question: membership })}
                              >
                                Edit
                              </button>
                              <button
                                className="button secondary"
                                type="button"
                                disabled={selectedQuestionBank.isActive === false}
                                onClick={() => setQuestionRemoveTarget(membership)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No questions are mapped to this Competition Question Bank yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedCourse && selectedCourseLevel && selectedQuestionBank && courseWorkspace === "question-bank" && !questionsOpen ? (
            <section className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Worksheets — {selectedQuestionBank.name}</h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
                    {selectedCourse.name} / Level {selectedCourseLevel.level?.rank ?? selectedCourseLevel.levelNumber} / {selectedQuestionBank.code}
                  </p>
                </div>
                {selectedCourse.isActive && selectedQuestionBank.isActive !== false ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="button"
                      type="button"
                      onClick={() => {
                        setWorksheetBuilderOpen(true);
                        void loadWorksheetBuilderQuestions();
                      }}
                    >
                      Build Worksheet From Questions
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => {
                        void loadExecutableWorksheets(selectedCourseLevel);
                        setWorksheetDialog({ open: true, worksheet: null });
                      }}
                    >
                      Link Existing Published Worksheet
                    </button>
                  </div>
                ) : null}
              </div>
              {!executableWorksheetsLoading && executableWorksheets.length === 0 ? (
                <div
                  className="card"
                  style={{
                    marginTop: 16,
                    padding: 14,
                    boxShadow: "none",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    alignItems: "center",
                    flexWrap: "wrap"
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700 }}>Executable Worksheet required</div>
                    <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>
                      No executable Worksheet is mapped yet. Build one directly from this Competition
                      Question Bank's questions, or link an existing published Worksheet.
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => void loadExecutableWorksheets(selectedCourseLevel)}
                    >
                      Refresh Published Worksheets
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table className="data-table">
                  <thead><tr><th>Code</th><th>Name</th><th>Executable Worksheet</th><th>Questions</th><th>Version</th><th>Description</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {worksheetsLoading ? (
                      <tr><td colSpan={8} style={{ textAlign: "center" }}>Loading Worksheets…</td></tr>
                    ) : worksheets.length ? worksheets.map((worksheet) => (
                      <tr key={worksheet.id}>
                        <td>{worksheet.code}</td>
                        <td>{worksheet.name}</td>
                        <td>{worksheet.worksheet?.title || (worksheet.worksheetId ? "Mapped" : "Not mapped")}</td>
                        <td>{worksheet.worksheet?._count?.questions ?? "—"}</td>
                        <td>{worksheet.version ?? 1}</td>
                        <td>{worksheet.description || "—"}</td>
                        <td><StatusBadge value={worksheet.isActive === false ? "ARCHIVED" : (worksheet.status || "ACTIVE")} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="button secondary" type="button" onClick={() => { setSelectedWorksheetId(worksheet.id); setActiveTab("business-partners"); setCourseWorkspace("assignments"); }}>Assignments</button><button className="button secondary" type="button" disabled={saving || worksheet.isActive === false || selectedQuestionBank.isActive === false || !selectedCourse.isActive} onClick={() => setWorksheetDialog({ open: true, worksheet })}>Edit</button>
                            <button className="button secondary" type="button" disabled={saving || worksheet.isActive === false || selectedQuestionBank.isActive === false || !selectedCourse.isActive} onClick={() => setConfirmTarget({ type: "worksheet", courseId: selectedCourse.id, courseLevelId: selectedCourseLevel.id, questionBankId: selectedQuestionBank.id, worksheet })}>Archive</button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No Competition Worksheets yet for this Question Bank.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {selectedCourse && selectedCourseLevel && selectedQuestionBank && selectedWorksheet && courseWorkspace === "assignments" ? (
            <section className="card" style={{ padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>Business Partner Assignments — {selectedWorksheet.name}</h2>
                  <p style={{ color: "var(--color-text-muted)", marginBottom: 0 }}>
                    Map this Worksheet to one or multiple active Business Partners. For each Competition Course + Level track, a Business Partner can have exactly one active Worksheet. Selecting a BP here automatically removes that BP from other Worksheets under this same Course Level.
                  </p>
                </div>
                <button
                  className="button"
                  type="button"
                  disabled={assignmentsLoading || assignmentsSaving || selectedWorksheet.isActive === false}
                  onClick={saveWorksheetAssignments}
                >
                  {assignmentsSaving ? "Saving…" : "Save Assignments"}
                </button>
              </div>

              <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
                {assignmentsLoading ? (
                  <div style={{ color: "var(--color-text-muted)" }}>Loading assignments…</div>
                ) : businessPartners.length ? (
                  businessPartners.map((partner) => {
                    const checked = assignedBusinessPartnerIds.includes(partner.id);
                    return (
                      <label
                        key={partner.id}
                        className="card"
                        style={{
                          padding: 12,
                          boxShadow: "none",
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                          cursor: selectedWorksheet.isActive === false ? "not-allowed" : "pointer"
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={selectedWorksheet.isActive === false}
                          onChange={() => toggleBusinessPartnerAssignment(partner.id)}
                        />
                        <span style={{ flex: 1 }}>
                          <strong>{partner.displayName || partner.name || partner.code || partner.id}</strong>
                          <span style={{ color: "var(--color-text-muted)", marginLeft: 8 }}>
                            {partner.code || ""}
                          </span>
                        </span>
                        {checked ? <StatusBadge value="ASSIGNED" /> : null}
                      </label>
                    );
                  })
                ) : (
                  <div style={{ color: "var(--color-text-muted)" }}>No active Business Partners available.</div>
                )}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {activeTab === "enrollment" ? (
        <div style={{ display: "grid", gap: 16 }}>
          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0 }}>Automatic Enrollment Approval</h2>
                <p style={{ marginBottom: 0, color: "var(--color-text-muted)" }}>Center-combined lists are approved automatically when the complete request fits its Competition + Business Partner quota.</p>
              </div>
              <button className="button secondary" type="button" disabled={enrollmentListsLoading || enrollmentDetailLoading} onClick={refreshEnrollment}>Refresh Enrollment</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginTop: 16 }}>
              {[["Center Lists", enrollmentLists.length], ["Waiting for quota", enrollmentPendingCount], ["Approved", enrollmentApprovedCount]].map(([label, value]) => (
                <div key={label} className="card" style={{ padding: 14, boxShadow: "none" }}>
                  <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{label}</div>
                  <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6 }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          {enrollmentError ? <div className="error">{enrollmentError}</div> : null}

          <section className="card" style={{ padding: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0 }}>Business Partner Participation-ID Quotas</h3>
                <p style={{ marginBottom: 0, color: "var(--color-text-muted)" }}>Quota is separate for this Competition and each Business Partner. One enrolled level consumes one participation ID.</p>
              </div>
              <button className="button secondary" type="button" disabled={quotaLoading || Boolean(quotaSavingId) || Boolean(quotaReprocessingId)} onClick={loadQuotas}>Refresh Quotas</button>
            </div>
            <div style={{ overflowX: "auto", marginTop: 16 }}>
              <table className="data-table">
                <thead><tr><th>Business Partner</th><th>Quota</th><th>Used</th><th>Remaining</th><th>Waiting IDs</th><th>Waiting Requests</th><th>Change reason</th><th>Action</th></tr></thead>
                <tbody>
                  {quotaLoading ? (
                    <tr><td colSpan={8} style={{ textAlign: "center" }}>Loading quotas...</td></tr>
                  ) : businessPartners.length ? businessPartners.map((partner) => {
                    const row = quotaByBusinessPartnerId.get(partner.id);
                    const draft = quotaDrafts[partner.id] || {};
                    return (
                      <tr key={partner.id}>
                        <td><strong>{partner.displayName || partner.name || partner.code}</strong><div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{partner.code || "—"}</div></td>
                        <td><input className="input" type="number" min="0" step="1" style={{ width: 110 }} value={draft.quotaLimit ?? String(row?.quotaLimit ?? 0)} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [partner.id]: { ...(current[partner.id] || {}), quotaLimit: event.target.value } }))} /></td>
                        <td>{row?.usedIds ?? 0}</td>
                        <td>{row?.remainingIds ?? 0}</td>
                        <td>{row?.waitingIds ?? 0}</td>
                        <td>{row?.waitingRequestCount ?? 0}</td>
                        <td><input className="input" style={{ minWidth: 220 }} placeholder="Required reason" value={draft.reason || ""} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [partner.id]: { ...(current[partner.id] || {}), reason: event.target.value } }))} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button className="button" type="button" disabled={Boolean(quotaSavingId) || Boolean(quotaReprocessingId)} onClick={() => void saveQuota(partner.id)}>{quotaSavingId === partner.id ? "Saving..." : "Save"}</button>
                            <button className="button secondary" type="button" disabled={!row?.id || Boolean(quotaSavingId) || Boolean(quotaReprocessingId)} onClick={() => void reprocessWaitingLists(partner.id)}>{quotaReprocessingId === partner.id ? "Reprocessing..." : "Reprocess Waiting"}</button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No active Business Partners are available.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" style={{ padding: 20 }}>
            <h3 style={{ marginTop: 0 }}>Enrollment Lists</h3>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Center</th><th>Status</th><th>Items</th><th>Forwarded</th><th>Approved</th><th>Action</th></tr></thead>
                <tbody>
                  {enrollmentListsLoading ? (
                    <tr><td colSpan={6} style={{ textAlign: "center" }}>Loading enrollment lists...</td></tr>
                  ) : enrollmentLists.length ? enrollmentLists.map((entry) => (
                    <tr key={entry.id}>
                      <td><strong>{entry.centerNode?.name || entry.centerNode?.code || entry.hierarchyNodeId || "—"}</strong>{entry.centerNode?.code && entry.centerNode?.name ? <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{entry.centerNode.code}</div> : null}</td>
                      <td><StatusBadge value={entry.status} /></td>
                      <td>{entry._count?.items ?? 0}</td>
                      <td>{formatDateTime(entry.forwardedAt)}</td>
                      <td>{formatDateTime(entry.approvedAt)}</td>
                      <td><button className={`button ${selectedEnrollmentListId === entry.id ? "" : "secondary"}`} type="button" onClick={() => setSelectedEnrollmentListId(entry.id)}>{selectedEnrollmentListId === entry.id ? "Selected" : "Open"}</button></td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No Center enrollment lists have reached this Competition yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {selectedEnrollmentListId ? (
            <section className="card" style={{ padding: 20 }}>
              {enrollmentDetailLoading ? <LoadingState label="Loading enrollment list..." /> : selectedEnrollmentList ? (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ margin: 0 }}>{selectedEnrollmentList.centerNode?.name || selectedEnrollmentList.centerNode?.code || "Center Enrollment List"}</h3>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
                        <StatusBadge value={selectedEnrollmentList.status} />
                        <span style={{ color: "var(--color-text-muted)" }}>Included {selectedEnrollmentList.includedCount ?? 0} · Excluded {selectedEnrollmentList.excludedCount ?? 0}</span>
                      </div>
                    </div>
                    <StatusBadge value={selectedEnrollmentList.approvalMode || "SYSTEM_MANAGED"} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 10 }}>
                    {[
                      ["Center", selectedEnrollmentList.centerNode?.name || selectedEnrollmentList.centerNode?.code],
                      ["List Type", selectedEnrollmentList.type],
                      ["Submitted", formatDateTime(selectedEnrollmentList.submittedAt)],
                      ["Forwarded", formatDateTime(selectedEnrollmentList.forwardedAt)],
                      ["Approved", formatDateTime(selectedEnrollmentList.approvedAt)],
                      ["Returned / Rejected", formatDateTime(selectedEnrollmentList.rejectedAt)],
                      ["Returned By", selectedEnrollmentList.rejectedBy?.role],
                      ["Return Reason", selectedEnrollmentList.rejectedRemark]
                    ].map(([label, value]) => (
                      <div key={label} className="card" style={{ padding: 12, boxShadow: "none" }}>
                        <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{label}</div>
                        <div style={{ fontWeight: 700, marginTop: 4 }}>{value || "—"}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ color: "var(--color-text-muted)" }}>{selectedEnrollmentList.status === "WAITING_FOR_QUOTA" ? (selectedEnrollmentList.waitingReason || "This complete request is waiting for available quota.") : "Approval is system-managed; manual approval is not required."}</div>

                  <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                      <thead><tr><th>Student</th><th>Admission No.</th><th>Type</th><th>Course</th><th>Level</th><th>Selection</th><th>Approved</th><th>Attempt Limit</th><th>Action</th></tr></thead>
                      <tbody>
                        {selectedEnrollmentItems.length ? selectedEnrollmentItems.map((item) => {
                          const enrollment = item?.enrollment || {};
                          const student = enrollment.student || {};
                          const competitionCourseLevel = enrollment.competitionCourseLevel || {};
                          const courseLevel = competitionCourseLevel.courseLevel || {};
                          const course = courseLevel.course || {};
                          const level = competitionCourseLevel.level || {};
                          const studentName = `${student.firstName || ""} ${student.lastName || ""}`.trim() || student.id || "—";
                          return (
                            <tr key={enrollment.id || `${student.id}-${competitionCourseLevel.id}`}>
                              <td>{studentName}</td><td>{student.admissionNo || "—"}</td><td>{enrollment.isTemporary ? "Temporary" : "Regular"}</td><td>{course.name || course.code || "—"}</td><td>{level.name || (level.rank ? `Level ${level.rank}` : courseLevel.title || "—")}</td>
                              <td><StatusBadge value={item.included ? "INCLUDED" : "EXCLUDED"} />{!item.included && item.exclusionReason ? <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>{item.exclusionReason}</div> : null}</td>
                              <td>{enrollment.approvedAt ? formatDateTime(enrollment.approvedAt) : "—"}</td>
                              <td>{enrollment.attemptLimitOverride || competition?.attemptLimit || 1}</td>
                              <td>
                                <button
                                  className="button secondary"
                                  disabled={!item.included || !enrollment.approvedAt || extraAttemptEnrollmentId === enrollment.id}
                                  onClick={() => void handleGrantExtraAttempt(enrollment)}
                                  style={{ width: "auto" }}
                                  type="button"
                                >
                                  {extraAttemptEnrollmentId === enrollment.id ? "Granting..." : "Grant Extra Attempt"}
                                </button>
                              </td>
                            </tr>
                          );
                        }) : <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--color-text-muted)" }}>No student-level participations are present in this list.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : <div style={{ color: "var(--color-text-muted)" }}>Select an enrollment list to review.</div>}
            </section>
          ) : null}
        </div>
      ) : null}
      {activeTab === "results" ? (
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Competition Results</h2>
          <p style={{ color: "var(--color-text-muted)" }}>
            Results already use the existing Competition results lifecycle. Open the
            current Results workspace to review, publish, unpublish, and export results.
          </p>
          <Link
            className="button"
            style={{ width: "auto" }}
            to={`/superadmin/competition/${competitionId}/results`}
          >
            Open Competition Results
          </Link>
        </section>
      ) : null}
      {activeTab === "rankings" ? (
        <section className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>Competition Rankings</h2>
          <p style={{ color: "var(--color-text-muted)" }}>
            Ranking is produced by the existing Competition leaderboard/result flow.
            Use the current Results workspace instead of creating a second ranking system.
          </p>
          <Link
            className="button"
            style={{ width: "auto" }}
            to={`/superadmin/competition/${competitionId}/results`}
          >
            Open Results & Rankings
          </Link>
        </section>
      ) : null}
      {activeTab === "settings" ? (
        <CompetitionScheduleSettings
          competition={competition}
          saving={saving}
          onSave={saveCompetitionSchedule}
        />
      ) : null}

      <CourseDialog open={courseDialog.open} course={courseDialog.course} saving={saving} onClose={() => setCourseDialog({ open: false, course: null })} onSave={saveCourse} />
      <ReuseCompetitionResourcesDialog
        open={reuseDialogOpen}
        sources={reuseSources.filter((entry) => entry.id !== competitionId)}
        loading={reuseSourcesLoading}
        saving={saving}
        onClose={() => setReuseDialogOpen(false)}
        onSave={reuseCompetitionResources}
      />
      <QuestionBankDialog open={questionBankDialog.open} questionBank={questionBankDialog.questionBank} saving={saving} onClose={() => setQuestionBankDialog({ open: false, questionBank: null })} onSave={saveQuestionBank} />
      <CompetitionQuestionDialog open={questionDialog.open} question={questionDialog.question} saving={saving} onClose={() => setQuestionDialog({ open: false, question: null })} onSave={saveCompetitionQuestion} />
      <ConfirmDialog
        open={Boolean(questionRemoveTarget)}
        title="Remove Question From Bank"
        message="Remove this question from the Competition Question Bank? The source QuestionBank row is preserved."
        confirmLabel="Remove"
        confirmDisabled={saving}
        danger
        onCancel={() => setQuestionRemoveTarget(null)}
        onConfirm={removeCompetitionQuestion}
      />
      <CompetitionWorksheetBuilderDialog
        open={worksheetBuilderOpen}
        questionBank={selectedQuestionBank}
        questions={worksheetBuilderQuestions}
        loadingQuestions={worksheetBuilderQuestionsLoading}
        saving={saving}
        onClose={() => setWorksheetBuilderOpen(false)}
        onRefreshQuestions={() => void loadWorksheetBuilderQuestions()}
        onSave={buildWorksheet}
      />
      <WorksheetDialog
        open={worksheetDialog.open}
        worksheet={worksheetDialog.worksheet}
        saving={saving}
        executableWorksheets={executableWorksheets}
        executableWorksheetsLoading={executableWorksheetsLoading}
        onClose={() => setWorksheetDialog({ open: false, worksheet: null })}
        onRefreshExecutableWorksheets={() => void loadExecutableWorksheets(selectedCourseLevel)}
        onSave={saveWorksheet}
      />
      <ConfirmDialog open={Boolean(confirmTarget)} title={confirmTarget?.type === "course" ? "Archive Competition Course" : confirmTarget?.type === "restore-course" ? "Restore Competition Course" : confirmTarget?.type === "question-bank" ? "Archive Question Bank" : confirmTarget?.type === "worksheet" ? "Archive Competition Worksheet" : "Remove Course Level"} message={confirmTarget?.type === "course" ? `Archive ${confirmTarget?.course?.name || "this Competition Course"}?` : confirmTarget?.type === "restore-course" ? `Restore ${confirmTarget?.course?.name || "this Competition Course"}?` : confirmTarget?.type === "question-bank" ? `Archive ${confirmTarget?.questionBank?.name || "this Question Bank"}?` : confirmTarget?.type === "worksheet" ? `Archive ${confirmTarget?.worksheet?.name || "this Competition Worksheet"}?` : "Remove this ERP Level from the Competition Course?"} confirmLabel={confirmTarget?.type === "course" || confirmTarget?.type === "question-bank" || confirmTarget?.type === "worksheet" ? "Archive" : confirmTarget?.type === "restore-course" ? "Restore" : "Remove"} confirmDisabled={saving} danger={confirmTarget?.type !== "restore-course"} onCancel={() => setConfirmTarget(null)} onConfirm={confirmAction} />
    </div>
  );
}

export { SuperadminCompetitionPendingPage };
