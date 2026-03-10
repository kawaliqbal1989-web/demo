import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createStudentPracticeWorksheet,
  getStudentPracticeFeatureStatus,
  getStudentPracticeWorksheetOptions
} from "../../services/studentPortalService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function opLabel(op) {
  const normalized = String(op || "").trim().toUpperCase();
  if (normalized === "ADD") return "Add";
  if (normalized === "SUB") return "Subtract";
  if (normalized === "MUL") return "Multiply";
  if (normalized === "DIV") return "Divide";
  if (normalized === "COLUMN_SUM") return "Column Sum";
  return normalized;
}

function StudentPracticeWorksheetPage() {
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [hasPracticeAccess, setHasPracticeAccess] = useState(true);

  const [level, setLevel] = useState(null);
  const [availableOps, setAvailableOps] = useState([]);
  const [operationCounts, setOperationCounts] = useState({});
  const [totalAvailable, setTotalAvailable] = useState(null);
  const [availableTopics, setAvailableTopics] = useState([]);
  const [topicCounts, setTopicCounts] = useState({});

  const [totalQuestions, setTotalQuestions] = useState(200);
  const [minutes, setMinutes] = useState(10);
  const [selectedOps, setSelectedOps] = useState([]);
  const [selectedTopics, setSelectedTopics] = useState([]);

  const safeSelectedOps = useMemo(() => {
    const allowed = new Set(availableOps.map((x) => String(x).trim()));
    return selectedOps.filter((op) => allowed.has(op));
  }, [availableOps, selectedOps]);

  const isColumnSumSelected = useMemo(() => {
    return safeSelectedOps.includes("COLUMN_SUM");
  }, [safeSelectedOps]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const statusResp = await getStudentPracticeFeatureStatus();
        const statusPayload = statusResp?.data?.data;
        const practiceEnabled = Boolean(statusPayload?.PRACTICE);
        if (cancelled) return;
        setHasPracticeAccess(practiceEnabled);
        if (!practiceEnabled) {
          setError("This feature is not enabled for your student account. Ask your center to assign it first.");
          return;
        }
        const resp = await getStudentPracticeWorksheetOptions();
        const payload = resp?.data?.data;
        if (cancelled) return;

        setLevel(payload?.level || null);
        const ops = Array.isArray(payload?.operations) ? payload.operations : [];
        setAvailableOps(ops);
        setSelectedOps(Array.isArray(ops) ? [...ops] : []);
        setOperationCounts(payload?.operationCounts && typeof payload.operationCounts === "object" ? payload.operationCounts : {});
        setTotalAvailable(Number.isFinite(Number(payload?.totalAvailable)) ? Number(payload.totalAvailable) : null);

        const topics = Array.isArray(payload?.topics) ? payload.topics : [];
        setAvailableTopics(topics);
        setSelectedTopics(Array.isArray(topics) ? [...topics] : []);
        setTopicCounts(payload?.topicCounts && typeof payload.topicCounts === "object" ? payload.topicCounts : {});
      } catch (e) {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(e) || "Failed to load practice options");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onToggleOp = (op) => {
    setSelectedOps((prev) => {
      const exists = prev.includes(op);
      if (exists) return prev.filter((x) => x !== op);
      return [...prev, op];
    });
  };

  const selectAllOps = () => {
    setSelectedOps(Array.isArray(availableOps) ? [...availableOps] : []);
  };

  const clearAllOps = () => {
    setSelectedOps([]);
  };

  const onToggleTopic = (topic) => {
    setSelectedTopics((prev) => {
      const exists = prev.includes(topic);
      if (exists) return prev.filter((x) => x !== topic);
      return [...prev, topic];
    });
  };

  const selectAllTopics = () => {
    setSelectedTopics(Array.isArray(availableTopics) ? [...availableTopics] : []);
  };

  const clearAllTopics = () => {
    setSelectedTopics([]);
  };

  const clearAll = () => {
    setSelectedOps([]);
    setSelectedTopics([]);
  };

  const onStart = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!hasPracticeAccess) {
      setError("This feature is not enabled for your student account. Ask your center to assign it first.");
      return;
    }

    setError(null);

    const qCount = Number(totalQuestions);
    const mins = Number(minutes);

    if (!Number.isFinite(qCount) || qCount <= 0 || !Number.isInteger(qCount)) {
      setError("Questions must be a positive integer");
      return;
    }

    if (!Number.isFinite(mins) || mins <= 0 || !Number.isInteger(mins)) {
      setError("Time must be a positive integer (minutes)");
      return;
    }

    if (!safeSelectedOps.length) {
      setError("Select at least one question type");
      return;
    }

    if (availableTopics.length) {
      if (selectedTopics.length && !isColumnSumSelected) {
        setError("To use syllabus topics, select the Column Sum question type");
        return;
      }
      if (isColumnSumSelected && !selectedTopics.length) {
        setError("Select at least one syllabus topic");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const resp = await createStudentPracticeWorksheet({
        totalQuestions: qCount,
        timeLimitSeconds: mins * 60,
        operations: safeSelectedOps,
        topics: isColumnSumSelected ? selectedTopics : []
      });
      const data = resp?.data?.data;
      const worksheetId = data?.worksheetId;
      if (!worksheetId) {
        throw new Error("Practice worksheet created but worksheetId missing");
      }
      navigate(`/student/worksheets/${worksheetId}`);
    } catch (e2) {
      setError(getFriendlyErrorMessage(e2) || "Failed to start practice worksheet");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Practice Worksheet</h1>
          <div className="muted">
            {level ? `Level ${level.rank}: ${level.name}` : ""}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card">Loading…</div>
      ) : !hasPracticeAccess ? (
        <div className="card">
          <div className="banner banner--error">
            {error || "This feature is not enabled for your student account. Ask your center to assign it first."}
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={onStart}>
          {error ? (
            <div className="banner banner--error" style={{ marginBottom: 12 }}>
              {error}
            </div>
          ) : null}

          <div className="form-grid">
            <label className="form-field">
              <span className="form-label">Number of questions</span>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={totalQuestions}
                onChange={(e3) => setTotalQuestions(e3.target.value)}
              />
            </label>

            <label className="form-field">
              <span className="form-label">Time (minutes)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={minutes}
                onChange={(e4) => setMinutes(e4.target.value)}
              />
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div className="form-label">Question types</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={selectAllOps}>
                  Select all
                </button>
                <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={clearAllOps}>
                  Clear
                </button>
              </div>
            </div>
            {totalAvailable !== null ? (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                Unique questions available for your level: <strong>{totalAvailable}</strong>
              </div>
            ) : null}
            <div className="chip-row">
              {availableOps.map((op) => (
                <label key={op} className="chip">
                  <input
                    type="checkbox"
                    checked={selectedOps.includes(op)}
                    onChange={() => onToggleOp(op)}
                  />
                  <span>
                    {opLabel(op)}
                    {Number.isFinite(Number(operationCounts?.[op])) ? (
                      <span className="muted" style={{ marginLeft: 6 }}>
                        ({operationCounts[op]})
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Note: practice may repeat questions to reach your selected count.
            </div>
          </div>

          {availableTopics.length ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <div className="form-label">Syllabus topics</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={selectAllTopics}>
                    Select all
                  </button>
                  <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={clearAllTopics}>
                    Clear
                  </button>
                </div>
              </div>
              <div className="chip-row">
                {availableTopics.map((topic) => (
                  <label key={topic} className="chip">
                    <input
                      type="checkbox"
                      disabled={!isColumnSumSelected}
                      checked={selectedTopics.includes(topic)}
                      onChange={() => onToggleTopic(topic)}
                    />
                    <span>
                      {topic}
                      {Number.isFinite(Number(topicCounts?.[topic])) ? (
                        <span className="muted" style={{ marginLeft: 6 }}>
                          ({topicCounts[topic]})
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
              {!isColumnSumSelected ? (
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Select <strong>Column Sum</strong> in Question types to enable syllabus topics.
                </div>
              ) : null}
            </div>
          ) : null}

          <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
            <button className="button secondary" type="button" onClick={clearAll}>
              Clear all
            </button>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
            <button className="btn" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Starting…" : "Start Practice"}
            </button>
            <button
              className="btn btn--secondary"
              type="button"
              onClick={() => navigate("/student/dashboard")}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export { StudentPracticeWorksheetPage };
