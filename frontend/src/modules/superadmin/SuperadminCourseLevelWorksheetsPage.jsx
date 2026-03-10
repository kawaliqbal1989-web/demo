import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PaginationBar } from "../../components/DataTable";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getCourse } from "../../services/coursesService";
import { listLevels } from "../../services/levelsService";
import { getWorksheetTemplate, upsertWorksheetTemplate } from "../../services/worksheetTemplatesService";
import { listQuestionBank } from "../../services/questionBankService";
import {
  addWorksheetQuestion,
  addWorksheetQuestionsBulk,
  createWorksheet,
  deleteWorksheet,
  deleteWorksheetQuestion,
  duplicateWorksheet,
  getWorksheet,
  listWorksheets,
  updateWorksheet,
  reorderWorksheetQuestions
} from "../../services/worksheetsService";

function displayQuestion(question) {
  const operation = String(question?.operation || "").toUpperCase();
  const operands = question?.operands || {};
  const left = operands?.a ?? operands?.x ?? "?";
  const right = operands?.b ?? operands?.y ?? "?";
  const sign = operation === "ADD" ? "+" : operation === "SUB" ? "-" : operation === "MUL" ? "×" : operation === "DIV" ? "÷" : operation;
  return `${left} ${sign} ${right}`;
}

function SuperadminCourseLevelWorksheetsPage() {
  const navigate = useNavigate();
  const { courseId, levelNumber } = useParams();
  const levelNumberInt = Number(levelNumber);

  const [course, setCourse] = useState(null);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [template, setTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    totalQuestions: "10",
    easyCount: "3",
    mediumCount: "5",
    hardCount: "2",
    timeLimitSeconds: "600",
    isActive: true
  });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [bankItems, setBankItems] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  const [worksheets, setWorksheets] = useState([]);
  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheetsError, setWorksheetsError] = useState("");
  const [worksheetsLimit, setWorksheetsLimit] = useState(10);
  const [worksheetsOffset, setWorksheetsOffset] = useState(0);
  const [worksheetsPublished, setWorksheetsPublished] = useState("");
  const [worksheetsDifficulty, setWorksheetsDifficulty] = useState("");
  const [worksheetsQ, setWorksheetsQ] = useState("");
  const [worksheetCreateForm, setWorksheetCreateForm] = useState({
    title: "",
    description: "",
    difficulty: "MEDIUM",
    isPublished: false
  });
  const [worksheetCreating, setWorksheetCreating] = useState(false);

  const [selectedWorksheetId, setSelectedWorksheetId] = useState(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetLoading, setWorksheetLoading] = useState(false);
  const [worksheetError, setWorksheetError] = useState("");
  const [questionAddBankId, setQuestionAddBankId] = useState("");
  const [questionAdding, setQuestionAdding] = useState(false);
  const [bulkQuestionIds, setBulkQuestionIds] = useState([]);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [worksheetMetaForm, setWorksheetMetaForm] = useState({
    title: "",
    description: "",
    difficulty: "MEDIUM",
    isPublished: false
  });
  const [worksheetMetaSaving, setWorksheetMetaSaving] = useState(false);
  const [deleteWorksheetTarget, setDeleteWorksheetTarget] = useState(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [duplicateWorksheetTarget, setDuplicateWorksheetTarget] = useState(null);

  const [dirtyOrder, setDirtyOrder] = useState(false);
  const dragIdRef = useRef(null);

  const level = useMemo(() => {
    return levels.find((item) => Number(item.rank) === levelNumberInt) || null;
  }, [levels, levelNumberInt]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [courseResp, levelsResp] = await Promise.all([getCourse(courseId), listLevels()]);
      setCourse(courseResp?.data || null);
      setLevels(levelsResp?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load course level context.");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async (levelId) => {
    setTemplateError("");
    try {
      const resp = await getWorksheetTemplate(levelId);
      const next = resp?.data || null;
      setTemplate(next);
      if (next) {
        setTemplateForm({
          name: next.name || "",
          totalQuestions: String(next.totalQuestions ?? ""),
          easyCount: String(next.easyCount ?? ""),
          mediumCount: String(next.mediumCount ?? ""),
          hardCount: String(next.hardCount ?? ""),
          timeLimitSeconds: String(next.timeLimitSeconds ?? ""),
          isActive: Boolean(next.isActive)
        });
      }
    } catch (err) {
      setTemplateError(getFriendlyErrorMessage(err) || "Failed to load worksheet template.");
    }
  };

  const loadBank = async (levelId) => {
    setBankLoading(true);
    try {
      const resp = await listQuestionBank({ levelId });
      setBankItems(resp?.data?.items || []);
    } catch {
      setBankItems([]);
    } finally {
      setBankLoading(false);
    }
  };

  const loadWorksheets = async (levelId, options = {}) => {
    const next = {
      limit: options.limit ?? worksheetsLimit,
      offset: options.offset ?? worksheetsOffset,
      published: options.published ?? worksheetsPublished,
      difficulty: options.difficulty ?? worksheetsDifficulty,
      q: options.q ?? worksheetsQ
    };

    setWorksheetsLoading(true);
    setWorksheetsError("");
    try {
      const resp = await listWorksheets({
        levelId,
        limit: next.limit,
        offset: next.offset,
        published: next.published || undefined,
        difficulty: next.difficulty || undefined,
        q: next.q || undefined
      });
      setWorksheets(resp?.data || []);
      setWorksheetsLimit(next.limit);
      setWorksheetsOffset(next.offset);

      if (selectedWorksheetId && !(resp?.data || []).some((row) => row.id === selectedWorksheetId)) {
        setSelectedWorksheetId(null);
        setSelectedWorksheet(null);
      }
    } catch (err) {
      setWorksheetsError(getFriendlyErrorMessage(err) || "Failed to load worksheets.");
    } finally {
      setWorksheetsLoading(false);
    }
  };

  const loadWorksheet = async (id) => {
    setWorksheetLoading(true);
    setWorksheetError("");
    setDirtyOrder(false);
    try {
      const resp = await getWorksheet(id);
      setSelectedWorksheet(resp?.data || null);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to load worksheet.");
      setSelectedWorksheet(null);
    } finally {
      setWorksheetLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [courseId, levelNumber]);

  useEffect(() => {
    if (!level?.id) {
      return;
    }
    void loadTemplate(level.id);
    void loadBank(level.id);
    void loadWorksheets(level.id, { offset: 0 });
  }, [level?.id]);

  useEffect(() => {
    if (!selectedWorksheetId) {
      setSelectedWorksheet(null);
      return;
    }
    void loadWorksheet(selectedWorksheetId);
  }, [selectedWorksheetId]);

  useEffect(() => {
    if (!selectedWorksheet) {
      return;
    }

    setWorksheetMetaForm({
      title: selectedWorksheet.title || "",
      description: selectedWorksheet.description || "",
      difficulty: selectedWorksheet.difficulty || "MEDIUM",
      isPublished: Boolean(selectedWorksheet.isPublished)
    });
  }, [selectedWorksheet]);

  if (loading) {
    return <LoadingState label="Loading worksheets..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load" message={error} onRetry={load} />;
  }

  if (!course || !level) {
    return <ErrorState title="Level not found" message="The course level could not be resolved." />;
  }

  const onSaveTemplate = async (event) => {
    event.preventDefault();
    setTemplateSaving(true);
    setTemplateError("");
    try {
      await upsertWorksheetTemplate(level.id, {
        name: templateForm.name,
        totalQuestions: Number(templateForm.totalQuestions),
        easyCount: Number(templateForm.easyCount),
        mediumCount: Number(templateForm.mediumCount),
        hardCount: Number(templateForm.hardCount),
        timeLimitSeconds: Number(templateForm.timeLimitSeconds),
        isActive: Boolean(templateForm.isActive)
      });
      await loadTemplate(level.id);
    } catch (err) {
      setTemplateError(getFriendlyErrorMessage(err) || "Failed to save worksheet template.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const onCreateWorksheet = async (event) => {
    event.preventDefault();
    setWorksheetCreating(true);
    setWorksheetsError("");
    try {
      if (!worksheetCreateForm.title.trim()) {
        setWorksheetsError("Worksheet title is required.");
        return;
      }

      if (worksheetCreateForm.isPublished) {
        setWorksheetsError("Create worksheet as draft first. Add questions, then publish from Worksheet Details.");
        return;
      }

      await createWorksheet({
        title: worksheetCreateForm.title.trim(),
        description: worksheetCreateForm.description.trim() || null,
        difficulty: worksheetCreateForm.difficulty,
        levelId: level.id,
        isPublished: false
      });

      setWorksheetCreateForm({ title: "", description: "", difficulty: "MEDIUM", isPublished: false });
  await loadWorksheets(level.id, { offset: 0 });
    } catch (err) {
      setWorksheetsError(getFriendlyErrorMessage(err) || "Failed to create worksheet.");
    } finally {
      setWorksheetCreating(false);
    }
  };

  const onAddQuestionToWorksheet = async () => {
    if (!selectedWorksheet?.id || !questionAddBankId) {
      return;
    }

    setQuestionAdding(true);
    setWorksheetError("");
    try {
      await addWorksheetQuestion(selectedWorksheet.id, { questionBankId: questionAddBankId });
      setQuestionAddBankId("");
      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(level.id);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to add question.");
    } finally {
      setQuestionAdding(false);
    }
  };

  const moveQuestion = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) {
      return;
    }

    const ids = (selectedWorksheet?.questions || []).map((item) => item.id);
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reorderedIds = [...ids];
    reorderedIds.splice(fromIndex, 1);
    reorderedIds.splice(toIndex, 0, fromId);

    const byId = new Map((selectedWorksheet?.questions || []).map((item) => [item.id, item]));
    const reordered = reorderedIds.map((id) => byId.get(id)).filter(Boolean);

    setSelectedWorksheet((prev) => (prev ? { ...prev, questions: reordered } : prev));
    setDirtyOrder(true);
  };

  const onSaveOrder = async () => {
    if (!selectedWorksheet?.id) {
      return;
    }

    setWorksheetError("");
    try {
      const orderedIds = (selectedWorksheet.questions || []).map((item) => item.id);
      await reorderWorksheetQuestions(selectedWorksheet.id, orderedIds);
      setDirtyOrder(false);
      await loadWorksheet(selectedWorksheet.id);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to reorder worksheet questions.");
    }
  };

  const onSaveWorksheetMeta = async (event) => {
    event.preventDefault();
    if (!selectedWorksheet?.id) {
      return;
    }

    setWorksheetMetaSaving(true);
    setWorksheetError("");
    try {
      await updateWorksheet(selectedWorksheet.id, {
        title: worksheetMetaForm.title.trim(),
        description: worksheetMetaForm.description.trim() || null,
        difficulty: worksheetMetaForm.difficulty,
        isPublished: Boolean(worksheetMetaForm.isPublished)
      });

      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(level.id);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to update worksheet.");
    } finally {
      setWorksheetMetaSaving(false);
    }
  };

  const onDuplicateWorksheet = async () => {
    const target = duplicateWorksheetTarget;
    setDuplicateWorksheetTarget(null);
    if (!target) {
      return;
    }

    setWorksheetError("");
    try {
      const resp = await duplicateWorksheet(target.id);
      const createdId = resp?.data?.id || null;
      await loadWorksheets(level.id, { offset: 0 });
      if (createdId) {
        setSelectedWorksheetId(createdId);
      }
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to duplicate worksheet.");
    }
  };

  const onAddBulkQuestions = async () => {
    if (!selectedWorksheet?.id || !bulkQuestionIds.length) {
      return;
    }

    setBulkAdding(true);
    setWorksheetError("");
    try {
      await addWorksheetQuestionsBulk(selectedWorksheet.id, bulkQuestionIds);
      setBulkQuestionIds([]);
      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(level.id);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to add selected questions.");
    } finally {
      setBulkAdding(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>
          Worksheets: {course.name} · Level {levelNumberInt}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage worksheet template, create worksheets, and build worksheet questions.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}`)}
        >
          Back
        </button>
        <button
          className="button"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}/question-bank`)}
        >
          Open Question Bank
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Worksheet Template</h3>
        {templateError ? <div className="error">{templateError}</div> : null}
        <form onSubmit={onSaveTemplate} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Name
              <input className="input" value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label>
              Time Limit (seconds)
              <input
                className="input"
                inputMode="numeric"
                value={templateForm.timeLimitSeconds}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, timeLimitSeconds: event.target.value }))}
              />
            </label>
            <label>
              Total Questions
              <input
                className="input"
                inputMode="numeric"
                value={templateForm.totalQuestions}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, totalQuestions: event.target.value }))}
              />
            </label>
            <label>
              Active
              <select
                className="select"
                value={templateForm.isActive ? "true" : "false"}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, isActive: event.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Easy
              <input className="input" inputMode="numeric" value={templateForm.easyCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, easyCount: event.target.value }))} />
            </label>
            <label>
              Medium
              <input className="input" inputMode="numeric" value={templateForm.mediumCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, mediumCount: event.target.value }))} />
            </label>
            <label>
              Hard
              <input className="input" inputMode="numeric" value={templateForm.hardCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, hardCount: event.target.value }))} />
            </label>
          </div>

          <button className="button" type="submit" style={{ width: "auto" }} disabled={templateSaving}>
            {templateSaving ? "Saving..." : template ? "Update Template" : "Create Template"}
          </button>
        </form>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Worksheets</h3>
        {worksheetsError ? <div className="error">{worksheetsError}</div> : null}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 160px 160px 130px" }}>
          <label>
            Search
            <input
              className="input"
              placeholder="Title or description"
              value={worksheetsQ}
              onChange={(event) => setWorksheetsQ(event.target.value)}
            />
          </label>
          <label>
            Published
            <select className="select" value={worksheetsPublished} onChange={(event) => setWorksheetsPublished(event.target.value)}>
              <option value="">All</option>
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </select>
          </label>
          <label>
            Difficulty
            <select className="select" value={worksheetsDifficulty} onChange={(event) => setWorksheetsDifficulty(event.target.value)}>
              <option value="">All</option>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </select>
          </label>
          <label>
            Per Page
            <select
              className="select"
              value={String(worksheetsLimit)}
              onChange={(event) => {
                const nextLimit = Number(event.target.value);
                void loadWorksheets(level.id, { limit: nextLimit, offset: 0 });
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
              <option value="40">40</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => void loadWorksheets(level.id, { offset: 0 })}
            disabled={worksheetsLoading}
          >
            {worksheetsLoading ? "Loading..." : "Apply Filters"}
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setWorksheetsQ("");
              setWorksheetsPublished("");
              setWorksheetsDifficulty("");
              void loadWorksheets(level.id, { q: "", published: "", difficulty: "", offset: 0 });
            }}
          >
            Reset Filters
          </button>
        </div>

        <form onSubmit={onCreateWorksheet} style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            New worksheets are created as draft. Publish after adding questions from Worksheet Details.
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Title
              <input className="input" value={worksheetCreateForm.title} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, title: event.target.value }))} />
            </label>
            <label>
              Difficulty
              <select className="select" value={worksheetCreateForm.difficulty} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, difficulty: event.target.value }))}>
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <input className="input" value={worksheetCreateForm.description} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, description: event.target.value }))} />
            </label>
            <label>
              Publish
              <select className="select" value={worksheetCreateForm.isPublished ? "true" : "false"} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, isPublished: event.target.value === "true" }))}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
          </div>

          <button className="button" type="submit" style={{ width: "auto" }} disabled={worksheetCreating}>
            {worksheetCreating ? "Creating..." : "Create Worksheet"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 2fr" }}>
          <div>
            {worksheetsLoading ? <LoadingState label="Loading worksheets..." /> : null}
            <div style={{ display: "grid", gap: 8 }}>
              {worksheets.map((worksheet) => (
                <button
                  key={worksheet.id}
                  type="button"
                  className={worksheet.id === selectedWorksheetId ? "button" : "button secondary"}
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setSelectedWorksheetId(worksheet.id)}
                >
                  {worksheet.title}
                </button>
              ))}
            </div>

            <PaginationBar
              limit={worksheetsLimit}
              offset={worksheetsOffset}
              count={worksheets.length}
              onChange={(next) => {
                void loadWorksheets(level.id, next);
              }}
            />
          </div>

          <div>
            {!selectedWorksheetId ? (
              <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Select a worksheet to build and preview.</div>
            ) : worksheetLoading ? (
              <LoadingState label="Loading worksheet..." />
            ) : worksheetError ? (
              <ErrorState title="Worksheet error" message={worksheetError} onRetry={() => loadWorksheet(selectedWorksheetId)} />
            ) : selectedWorksheet ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedWorksheet.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Drag-drop questions to reorder, then save.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onSaveOrder} disabled={!dirtyOrder}>
                      Save Order
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => setDuplicateWorksheetTarget(selectedWorksheet)}
                    >
                      Duplicate as Draft
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => setDeleteWorksheetTarget(selectedWorksheet)}
                    >
                      Delete Worksheet
                    </button>
                  </div>
                </div>

                <div className="card" style={{ display: "grid", gap: 10, borderColor: "var(--color-border)" }}>
                  <div style={{ fontWeight: 700 }}>Worksheet Details</div>
                  <form onSubmit={onSaveWorksheetMeta} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                      <label>
                        Title
                        <input
                          className="input"
                          value={worksheetMetaForm.title}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, title: event.target.value }))}
                        />
                      </label>
                      <label>
                        Difficulty
                        <select
                          className="select"
                          value={worksheetMetaForm.difficulty}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, difficulty: event.target.value }))}
                        >
                          <option value="EASY">EASY</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HARD">HARD</option>
                        </select>
                      </label>
                      <label style={{ gridColumn: "1 / -1" }}>
                        Description
                        <input
                          className="input"
                          value={worksheetMetaForm.description}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, description: event.target.value }))}
                        />
                      </label>
                      <label>
                        Publish
                        <select
                          className="select"
                          value={worksheetMetaForm.isPublished ? "true" : "false"}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, isPublished: event.target.value === "true" }))}
                        >
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </label>
                    </div>

                    <button className="button" type="submit" style={{ width: "auto" }} disabled={worksheetMetaSaving}>
                      {worksheetMetaSaving ? "Saving..." : "Save Details"}
                    </button>
                  </form>
                </div>

                <div className="card" style={{ display: "grid", gap: 10, borderColor: "var(--color-border)" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                    <label style={{ display: "grid", gap: 6, minWidth: 260 }}>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Add from Question Bank</span>
                      <select className="select" value={questionAddBankId} onChange={(event) => setQuestionAddBankId(event.target.value)}>
                        <option value="">Select question…</option>
                        {bankItems.map((question) => (
                          <option key={question.id} value={question.id}>
                            {question.difficulty}: {question.prompt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button" type="button" style={{ width: "auto" }} onClick={onAddQuestionToWorksheet} disabled={!questionAddBankId || questionAdding || bankLoading}>
                      {questionAdding ? "Adding..." : "Add"}
                    </button>
                  </div>

                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Bulk Add from Question Bank</div>
                    <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                      {bankItems.map((question) => {
                        const checked = bulkQuestionIds.includes(question.id);
                        return (
                          <label key={question.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextChecked = event.target.checked;
                                setBulkQuestionIds((prev) => {
                                  if (nextChecked) {
                                    if (prev.includes(question.id)) {
                                      return prev;
                                    }
                                    return [...prev, question.id];
                                  }
                                  return prev.filter((id) => id !== question.id);
                                });
                              }}
                            />
                            <span style={{ fontSize: 13 }}>{question.difficulty}: {question.prompt}</span>
                          </label>
                        );
                      })}
                      {!bankItems.length ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No question bank entries available.</div> : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="button"
                        type="button"
                        style={{ width: "auto" }}
                        onClick={onAddBulkQuestions}
                        disabled={!bulkQuestionIds.length || bulkAdding || bankLoading}
                      >
                        {bulkAdding ? "Adding Selected..." : `Add Selected (${bulkQuestionIds.length})`}
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        style={{ width: "auto" }}
                        onClick={() => setBulkQuestionIds([])}
                        disabled={!bulkQuestionIds.length || bulkAdding}
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ display: "grid", gap: 8 }} aria-label="Worksheet builder">
                  {(selectedWorksheet.questions || []).length === 0 ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No questions yet. Add from question bank.</div>
                  ) : (
                    (selectedWorksheet.questions || []).map((question) => (
                      <div
                        key={question.id}
                        draggable
                        onDragStart={() => {
                          dragIdRef.current = question.id;
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          const fromId = dragIdRef.current;
                          dragIdRef.current = null;
                          moveQuestion(fromId, question.id);
                        }}
                        style={{
                          padding: 10,
                          border: "1px solid var(--color-border)",
                          borderRadius: 10,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>#{question.questionNumber}</div>
                          <div style={{ fontWeight: 700 }}>{displayQuestion(question)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Drag</div>
                          <button
                            className="button secondary"
                            type="button"
                            style={{ width: "auto" }}
                            onClick={() => setDeleteQuestionTarget(question)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ display: "grid", gap: 8 }} aria-label="Preview">
                  <div style={{ fontWeight: 700 }}>Preview</div>
                  {(selectedWorksheet.questions || []).map((question) => (
                    <div key={question.id} style={{ display: "flex", gap: 10 }}>
                      <div style={{ width: 28, color: "var(--color-text-muted)" }}>{question.questionNumber}.</div>
                      <div>{displayQuestion(question)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteWorksheetTarget)}
        title="Delete Worksheet"
        message="Are you sure you want to delete this worksheet? This will remove its questions and submissions."
        confirmLabel="Delete"
        onConfirm={async () => {
          const target = deleteWorksheetTarget;
          setDeleteWorksheetTarget(null);
          if (!target) {
            return;
          }

          try {
            await deleteWorksheet(target.id);
            if (selectedWorksheetId === target.id) {
              setSelectedWorksheetId(null);
              setSelectedWorksheet(null);
            }
            await loadWorksheets(level.id);
          } catch (err) {
            setWorksheetError(getFriendlyErrorMessage(err) || "Failed to delete worksheet.");
          }
        }}
        onCancel={() => setDeleteWorksheetTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteQuestionTarget)}
        title="Remove Question"
        message="Remove this question from worksheet?"
        confirmLabel="Remove"
        onConfirm={async () => {
          const target = deleteQuestionTarget;
          setDeleteQuestionTarget(null);
          if (!target || !selectedWorksheet?.id) {
            return;
          }

          try {
            await deleteWorksheetQuestion(selectedWorksheet.id, target.id);
            await loadWorksheet(selectedWorksheet.id);
            await loadWorksheets(level.id);
          } catch (err) {
            setWorksheetError(getFriendlyErrorMessage(err) || "Failed to remove question.");
          }
        }}
        onCancel={() => setDeleteQuestionTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(duplicateWorksheetTarget)}
        title="Duplicate Worksheet"
        message="Create a copy of this worksheet as draft with all its questions?"
        confirmLabel="Duplicate"
        onConfirm={onDuplicateWorksheet}
        onCancel={() => setDuplicateWorksheetTarget(null)}
      />
    </section>
  );
}

export { SuperadminCourseLevelWorksheetsPage };
