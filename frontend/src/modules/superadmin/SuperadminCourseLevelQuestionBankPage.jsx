import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getCourse } from "../../services/coursesService";
import { listLevels } from "../../services/levelsService";
import {
  createQuestionBankEntry,
  updateQuestionBankEntry,
  deleteQuestionBankEntry,
  exportQuestionBankCsv,
  importQuestionBank,
  listQuestionBank
} from "../../services/questionBankService";

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const OP_DISPLAY = { ADD: "+", SUB: "-", MUL: "×", DIV: "÷" };

function renderExpression(question) {
  const operation = String(question?.operation || "").toUpperCase();
  const operands = question?.operands || {};
  const terms = Array.isArray(operands?.terms)
    ? operands.terms
    : [operands?.a ?? operands?.x, operands?.b ?? operands?.y].filter((value) => Number.isFinite(Number(value)));
  if (terms.length >= 2) {
    if (operation === "MIX") {
      const operators = Array.isArray(operands?.operators) ? operands.operators : [];
      return terms
        .map((term, index) => {
          if (index === 0) return String(Number(term));
          const op = operators[index] || "+";
          return `${OP_DISPLAY[op] || op} ${Number(term)}`;
        })
        .join(" ");
    }
    if (operation === "ADD") {
      return terms
        .map((term, index) => {
          const value = Number(term);
          if (index === 0) {
            return String(value);
          }
          return value < 0 ? `- ${Math.abs(value)}` : `+ ${value}`;
        })
        .join(" ");
    }
    const sign = operation === "SUB" ? "-" : operation === "MUL" ? "×" : operation === "DIV" ? "÷" : operation;
    return terms.map((term) => String(Number(term))).join(` ${sign} `);
  }
  const left = operands?.a ?? operands?.x ?? "?";
  const right = operands?.b ?? operands?.y ?? "?";
  const sign = operation === "ADD" ? "+" : operation === "SUB" ? "-" : operation === "MUL" ? "×" : operation === "DIV" ? "÷" : operation;
  return `${left} ${sign} ${right}`;
}

function computeCorrectAnswer(operation, terms, operators) {
  if (!Array.isArray(terms) || terms.length < 2) {
    return null;
  }

  const normalized = terms.map((item) => Number(item));
  if (!normalized.every((value) => Number.isFinite(value))) {
    return null;
  }

  if (operation === "MIX") {
    if (!Array.isArray(operators) || operators.length < terms.length) return null;
    // Left-to-right evaluation (abacus style)
    let total = normalized[0];
    for (let i = 1; i < normalized.length; i++) {
      const op = operators[i];
      if (op === "ADD") total = total + normalized[i];
      else if (op === "SUB") total = total - normalized[i];
      else if (op === "MUL") total = total * normalized[i];
      else if (op === "DIV") {
        if (normalized[i] === 0) return null;
        total = total / normalized[i];
      } else return null;
    }
    if (!Number.isFinite(total) || !Number.isInteger(total)) return null;
    return total;
  }

  if (operation === "ADD") {
    return normalized.reduce((total, value) => total + value, 0);
  }
  if (operation === "SUB") {
    return normalized.slice(1).reduce((total, value) => total - value, normalized[0]);
  }
  if (operation === "MUL") {
    return normalized.slice(1).reduce((total, value) => total * value, normalized[0]);
  }
  if (operation === "DIV") {
    let current = normalized[0];
    for (let index = 1; index < normalized.length; index += 1) {
      const next = normalized[index];
      if (next === 0) {
        return null;
      }
      const divided = current / next;
      if (!Number.isInteger(divided)) {
        return null;
      }
      current = divided;
    }
    return current;
  }
  return null;
}

function SuperadminCourseLevelQuestionBankPage() {
  const navigate = useNavigate();
  const { courseId, levelNumber } = useParams();
  const levelNumberInt = Number(levelNumber);

  const [course, setCourse] = useState(null);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [bankItems, setBankItems] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState("");
  const [bankQ, setBankQ] = useState("");
  const [pageLimit, setPageLimit] = useState(10);
  const [pageOffset, setPageOffset] = useState(0);
  const [bankCreateForm, setBankCreateForm] = useState({
    prompt: "",
    operation: "ADD",
    numbers: ["", ""],
    operators: ["", "+"]
  });
  const [bankCreating, setBankCreating] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [previewQuestionId, setPreviewQuestionId] = useState(null);

  const level = useMemo(() => {
    return levels.find((item) => Number(item.rank) === levelNumberInt) || null;
  }, [levels, levelNumberInt]);

  const visibleBankItems = useMemo(() => {
    return bankItems.slice(pageOffset, pageOffset + pageLimit);
  }, [bankItems, pageOffset, pageLimit]);

  const previewQuestion = useMemo(() => {
    return visibleBankItems.find((item) => item.id === previewQuestionId) || visibleBankItems[0] || null;
  }, [visibleBankItems, previewQuestionId]);

  const bankNumbersParsed = useMemo(() => {
    return bankCreateForm.numbers.map((item) => Number(item));
  }, [bankCreateForm.numbers]);

  const bankCalculatedAnswer = useMemo(() => {
    return computeCorrectAnswer(bankCreateForm.operation, bankNumbersParsed, bankCreateForm.operators);
  }, [bankCreateForm.operation, bankNumbersParsed, bankCreateForm.operators]);

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

  const loadBank = async (levelId) => {
    setBankLoading(true);
    setBankError("");
    try {
      const resp = await listQuestionBank({
        levelId,
        q: bankQ || undefined
      });
      setBankItems(resp?.data?.items || []);
      setPageOffset(0);
      setPreviewQuestionId(null);
    } catch (err) {
      setBankError(getFriendlyErrorMessage(err) || "Failed to load question bank.");
    } finally {
      setBankLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [courseId, levelNumber]);

  useEffect(() => {
    if (!level?.id) {
      return;
    }
    void loadBank(level.id);
  }, [level?.id]);

  if (loading) {
    return <LoadingState label="Loading question bank..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load" message={error} onRetry={load} />;
  }

  if (!course || !level) {
    return <ErrorState title="Level not found" message="The course level could not be resolved." />;
  }

  const onCreateBankQuestion = async (event) => {
    event.preventDefault();
    setBankCreating(true);
    setBankError("");
    try {
      const prompt = String(bankCreateForm.prompt || "").trim();
      if (!prompt) {
        setBankError("Prompt/Name is required.");
        return;
      }
      if (bankCreateForm.numbers.length < 2) {
        setBankError("Please keep at least 2 numbers.");
        return;
      }
      if (!bankNumbersParsed.every((value) => Number.isFinite(value))) {
        setBankError("All numbers must be valid.");
        return;
      }
      if (!bankNumbersParsed.every((value) => Number.isInteger(value))) {
        setBankError("Only integer values are supported.");
        return;
      }
      if (bankCalculatedAnswer === null) {
        setBankError("Invalid operation result. For division, use values that produce an integer answer.");
        return;
      }

      const operandsPayload = {
        a: bankNumbersParsed[0],
        b: bankNumbersParsed[1],
        terms: bankNumbersParsed
      };
      if (bankCreateForm.operation === "MIX") {
        operandsPayload.operators = bankCreateForm.operators;
      }

      const payload = {
        levelId: level.id,
        difficulty: "EASY",
        prompt,
        operation: bankCreateForm.operation,
        correctAnswer: bankCalculatedAnswer,
        operands: operandsPayload
      };

      if (editingQuestionId) {
        await updateQuestionBankEntry(editingQuestionId, payload);
        setEditingQuestionId(null);
      } else {
        await createQuestionBankEntry(payload);
      }

      setBankCreateForm((prev) => ({ ...prev, prompt: "", numbers: ["", ""], operators: ["", "+"] }));
      await loadBank(level.id);
    } catch (err) {
      setBankError(getFriendlyErrorMessage(err) || "Failed to create question.");
    } finally {
      setBankCreating(false);
    }
  };

  const onExportBank = async () => {
    try {
      const blob = await exportQuestionBankCsv({ levelId: level.id });
      downloadBlob(blob, `question-bank-level-${levelNumberInt}.csv`);
    } catch (err) {
      setBankError(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  const onImportBankJson = async (file) => {
    setBankError("");
    try {
      const text = await file.text();
      const items = JSON.parse(text);
      if (!Array.isArray(items)) {
        throw new Error("Import file must be a JSON array");
      }
      await importQuestionBank({ levelId: level.id, items });
      await loadBank(level.id);
    } catch (err) {
      setBankError(getFriendlyErrorMessage(err) || "Failed to import question bank.");
    }
  };

  const onEditQuestion = (row) => {
    const operands = row?.operands || {};
    const terms = Array.isArray(operands?.terms)
      ? operands.terms.map((t) => (t === null || t === undefined ? "" : String(t)))
      : [operands?.a ?? operands?.x ?? "", operands?.b ?? operands?.y ?? ""].map((t) => (t === null || t === undefined ? "" : String(t)));

    const rowOperators = Array.isArray(operands?.operators)
      ? operands.operators
      : terms.map((_, i) => (i === 0 ? "" : "+"));

    setBankCreateForm({
      prompt: row?.prompt || "",
      operation: String(row?.operation || "ADD"),
      numbers: terms,
      operators: rowOperators
    });
    setEditingQuestionId(row.id || null);
    // scroll to top of form
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>
          Question Bank: {course.name} · Level {levelNumberInt}
        </h2>
        <p style={{ margin: "6px 0 0", opacity: 0.75, fontSize: 13 }}>
          Create, search, import, export, and manage question bank entries.
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
          onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}/worksheets`)}
        >
          Open Worksheets
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Question Bank</h3>
            <p style={{ margin: "6px 0 0", opacity: 0.75, fontSize: 13 }}>Bulk import/export and CRUD.</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onExportBank}>
              Export CSV
            </button>
            <label className="button secondary" style={{ width: "auto", cursor: "pointer" }}>
              Import JSON
              <input
                type="file"
                accept="application/json"
                style={{ display: "none" }}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void onImportBankJson(file);
                  }
                  event.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {bankError ? <div className="error">{bankError}</div> : null}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search prompt"
            value={bankQ}
            onChange={(event) => setBankQ(event.target.value)}
            style={{ width: 260 }}
          />
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => void loadBank(level.id)}
            disabled={bankLoading}
          >
            {bankLoading ? "Loading..." : "Refresh"}
          </button>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Questions per page</span>
            <select
              className="select"
              value={String(pageLimit)}
              onChange={(event) => {
                const next = Number(event.target.value);
                setPageLimit(next);
                setPageOffset(0);
              }}
              style={{ width: 120 }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
              <option value="40">40</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 12 }}>
          <form onSubmit={onCreateBankQuestion} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label>
                Prompt / Name
                <input
                  className="input"
                  value={bankCreateForm.prompt}
                  onChange={(event) => setBankCreateForm((prev) => ({ ...prev, prompt: event.target.value }))}
                  placeholder="e.g. Practice Abacus - Lower Deck"
                />
              </label>
              <label>
                Operation
                <select
                  className="select"
                  value={bankCreateForm.operation}
                  onChange={(event) => setBankCreateForm((prev) => ({ ...prev, operation: event.target.value }))}
                >
                  <option value="ADD">Add (+ or no sign)</option>
                  <option value="SUB">Less (-)</option>
                  <option value="MUL">Multiply (x or *)</option>
                  <option value="DIV">Divide (/)</option>
                  <option value="MIX">Mix (+−×÷)</option>
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Numbers
                <div style={{ display: "grid", gap: 8 }}>
                  {(() => {
                    const minVisible = 5;
                    const displayCount = Math.max(bankCreateForm.numbers.length, minVisible);
                    return Array.from({ length: displayCount }).map((_, index) => {
                      const value = bankCreateForm.numbers[index] ?? "";
                      const isExisting = index < bankCreateForm.numbers.length;
                      return (
                        <div key={`term-${index}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          {bankCreateForm.operation === "MIX" && index > 0 ? (
                            <select
                              className="select"
                              style={{ width: 80 }}
                              value={bankCreateForm.operators[index] || "+"}
                              onChange={(event) => {
                                const nextOps = [...bankCreateForm.operators];
                                while (nextOps.length <= index) nextOps.push("+");
                                nextOps[index] = event.target.value;
                                setBankCreateForm((prev) => ({ ...prev, operators: nextOps }));
                              }}
                            >
                              <option value="ADD">+</option>
                              <option value="SUB">−</option>
                              <option value="MUL">×</option>
                              <option value="DIV">÷</option>
                            </select>
                          ) : null}
                          <input
                            className="input"
                            inputMode="numeric"
                            value={value}
                            onChange={(event) => {
                              const next = [...bankCreateForm.numbers];
                              // Ensure array grows to accommodate this index
                              while (next.length <= index) next.push("");
                              next[index] = event.target.value;
                              setBankCreateForm((prev) => ({ ...prev, numbers: next }));
                            }}
                            placeholder={`Number ${index + 1}`}
                          />
                          {isExisting && bankCreateForm.numbers.length > 2 ? (
                            <button
                              className="button secondary"
                              type="button"
                              style={{ width: "auto" }}
                              onClick={() => {
                                const next = bankCreateForm.numbers.filter((_, itemIndex) => itemIndex !== index);
                                if (next.length >= 2) {
                                  setBankCreateForm((prev) => ({ ...prev, numbers: next }));
                                }
                              }}
                            >
                              Remove
                            </button>
                          ) : null}
                        </div>
                      );
                    });
                  })()}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => setBankCreateForm((prev) => ({ ...prev, numbers: [...prev.numbers, ""], operators: [...prev.operators, "+"] }))}
                    >
                      Add Number
                    </button>
                    <span style={{ fontSize: 12, opacity: 0.75 }}>
                      Example: 2, -1, 2, 1, -3
                    </span>
                  </div>
                </div>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Correct Answer (Auto-filled)
                <input
                  className="input"
                  readOnly
                  value={bankCalculatedAnswer === null ? "" : String(bankCalculatedAnswer)}
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="button" type="submit" style={{ width: "auto" }} disabled={bankCreating}>
                {bankCreating ? (editingQuestionId ? "Saving..." : "Creating...") : (editingQuestionId ? "Save Changes" : "Add Question")}
              </button>
              {editingQuestionId ? (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setEditingQuestionId(null);
                    setBankCreateForm({ prompt: "", operation: "ADD", numbers: ["", ""], operators: ["", "+"] });
                    setBankError("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <DataTable
          columns={[
            { key: "prompt", header: "Prompt" },
            { key: "operation", header: "Op" },
            { key: "correctAnswer", header: "Answer" },
            {
              key: "actions",
              header: "Actions",
              render: (row) => (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setPreviewQuestionId(row.id)}
                  >
                    Preview
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => onEditQuestion(row)}
                  >
                    Edit
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setDeleteQuestionTarget(row)}
                  >
                    Delete
                  </button>
                </div>
              )
            }
          ]}
          rows={visibleBankItems}
          keyField="id"
        />

        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Question Preview</div>
          {!previewQuestion ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>No question available on this page.</div>
          ) : (
            <>
              <div style={{ fontSize: 13 }}>
                <strong>Prompt:</strong> {previewQuestion.prompt || "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Expression:</strong> {renderExpression(previewQuestion)}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Operation:</strong> {String(previewQuestion.operation || "").toUpperCase() || "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Correct Answer:</strong> {previewQuestion.correctAnswer ?? "—"}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>Operands:</strong>
                <pre style={{ margin: "6px 0 0", padding: 8, borderRadius: 8, overflowX: "auto", border: "1px solid var(--stroke)" }}>
                  {JSON.stringify(previewQuestion.operands || {}, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>

        <PaginationBar
          limit={pageLimit}
          offset={pageOffset}
          count={visibleBankItems.length}
          total={bankItems.length}
          onChange={(next) => {
            setPageLimit(next.limit);
            setPageOffset(next.offset);
          }}
        />
      </div>

      <ConfirmDialog
        open={Boolean(deleteQuestionTarget)}
        title="Delete Question"
        message="Are you sure you want to delete this question?"
        confirmLabel="Delete"
        onConfirm={async () => {
          const target = deleteQuestionTarget;
          setDeleteQuestionTarget(null);
          if (!target) {
            return;
          }
          await deleteQuestionBankEntry(target.id);
          await loadBank(level.id);
        }}
        onCancel={() => setDeleteQuestionTarget(null)}
      />
    </section>
  );
}

export { SuperadminCourseLevelQuestionBankPage };
