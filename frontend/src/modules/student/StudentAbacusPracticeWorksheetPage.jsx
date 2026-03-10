import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createStudentAbacusPracticeWorksheet,
  getStudentPracticeFeatureStatus,
  getStudentAbacusPracticeWorksheetOptions
} from "../../services/studentPortalService";
import { AuthContext } from "../../auth/AuthContext";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function opLabel(op) {
  const normalized = String(op || "").trim().toUpperCase();
  if (normalized === "ADD") return "Add (+)";
  if (normalized === "SUB") return "Less (-)";
  if (normalized === "MUL") return "Multiply (×)";
  if (normalized === "DIV") return "Divide (÷)";
  return normalized;
}

function StudentAbacusPracticeWorksheetPage() {
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const logout = auth?.logout;

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [hasAbacusPracticeAccess, setHasAbacusPracticeAccess] = useState(true);

  const [level, setLevel] = useState(null);
  const [availableOps, setAvailableOps] = useState([]);
  const [availableDigitsModes, setAvailableDigitsModes] = useState([
    "DIGIT_1",
    "DIGIT_2",
    "DIGIT_3",
    "SMALL_FRIENDS",
    "LOWER_DECK_1_4",
    "LOWER_DECK_TENS_10_40",
    "UPPER_DECK_1_9",
    "UPPER_DECK_TENS_50_90"
  ]);

  const [maxTotalQuestions, setMaxTotalQuestions] = useState(500);
  const [totalQuestions, setTotalQuestions] = useState(200);
  const [minutes, setMinutes] = useState(10);
  const [termCount, setTermCount] = useState(3);
  const [digitsMode, setDigitsMode] = useState("DIGIT_3");
  const [selectedOps, setSelectedOps] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        setError(null);
        const statusResp = await getStudentPracticeFeatureStatus();
        const statusPayload = statusResp?.data?.data;
        const abacusEnabled = Boolean(statusPayload?.ABACUS_PRACTICE);
        if (cancelled) return;
        setHasAbacusPracticeAccess(abacusEnabled);
        if (!abacusEnabled) {
          setError("This feature is not enabled for your student account. Ask your center to assign it first.");
          return;
        }
        const resp = await getStudentAbacusPracticeWorksheetOptions();
        const payload = resp?.data?.data;
        if (cancelled) return;

        setLevel(payload?.level || null);
        const ops = Array.isArray(payload?.operations) ? payload.operations : [];
        setAvailableOps(ops);
        setSelectedOps([...ops]);

        const dm = Array.isArray(payload?.digitsModes) ? payload.digitsModes : null;
        if (dm?.length) {
          setAvailableDigitsModes(dm);
          if (dm.includes("DIGIT_3")) setDigitsMode("DIGIT_3");
          else setDigitsMode(String(dm[0]));
        }

        const maxQ = Number(payload?.maxTotalQuestions);
        setMaxTotalQuestions(Number.isFinite(maxQ) && maxQ > 0 ? maxQ : 500);
        const defQ = Number(payload?.defaultTotalQuestions);
        setTotalQuestions(Number.isFinite(defQ) && defQ > 0 ? defQ : 200);

        const safeTermCounts = Array.isArray(payload?.termCounts) ? payload.termCounts : null;
        if (safeTermCounts?.includes(3)) setTermCount(3);

        // digitsModes handled above
      } catch (e) {
        if (cancelled) return;
        setError(getFriendlyErrorMessage(e) || "Failed to load abacus practice options");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const safeSelectedOps = useMemo(() => {
    const allowed = new Set(availableOps.map((x) => String(x).trim().toUpperCase()));
    return selectedOps
      .map((x) => String(x).trim().toUpperCase())
      .filter((x) => allowed.has(x));
  }, [availableOps, selectedOps]);

  const isLowerDeckMode = useMemo(() => {
    return String(digitsMode || "").trim().toUpperCase() === "LOWER_DECK_1_4";
  }, [digitsMode]);

  const isSmallFriendsMode = useMemo(() => {
    return String(digitsMode || "").trim().toUpperCase() === "SMALL_FRIENDS";
  }, [digitsMode]);

  const isTensLowerDeckMode = useMemo(() => {
    return String(digitsMode || "").trim().toUpperCase() === "LOWER_DECK_TENS_10_40";
  }, [digitsMode]);

  const isUpperDeckMode = useMemo(() => {
    return String(digitsMode || "").trim().toUpperCase() === "UPPER_DECK_1_9";
  }, [digitsMode]);

  const isTensUpperDeckMode = useMemo(() => {
    return String(digitsMode || "").trim().toUpperCase() === "UPPER_DECK_TENS_50_90";
  }, [digitsMode]);

  useEffect(() => {
    if (!isSmallFriendsMode && !isLowerDeckMode && !isTensLowerDeckMode && !isUpperDeckMode && !isTensUpperDeckMode) return;
    // Enforce UI-level restriction too (backend validates as well).
    setSelectedOps((prev) => prev.filter((op) => {
      const n = String(op || "").trim().toUpperCase();
      return n === "ADD" || n === "SUB";
    }));
  }, [isSmallFriendsMode, isLowerDeckMode, isTensLowerDeckMode, isUpperDeckMode, isTensUpperDeckMode]);

  const onToggleOp = (op) => {
    const normalized = String(op || "").trim().toUpperCase();
    if ((isSmallFriendsMode || isLowerDeckMode || isTensLowerDeckMode || isUpperDeckMode || isTensUpperDeckMode) && (normalized === "MUL" || normalized === "DIV")) {
      return;
    }
    setSelectedOps((prev) => {
      const exists = prev.map((x) => String(x).trim().toUpperCase()).includes(normalized);
      if (exists) return prev.filter((x) => String(x).trim().toUpperCase() !== normalized);
      return [...prev, normalized];
    });
  };

  const selectAllOps = () => {
    setSelectedOps([...availableOps]);
  };

  const clearAllOps = () => {
    setSelectedOps([]);
  };

  const onStart = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!hasAbacusPracticeAccess) {
      setError("This feature is not enabled for your student account. Ask your center to assign it first.");
      return;
    }

    setError(null);

    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0 || !Number.isInteger(mins)) {
      setError("Time must be a positive integer (minutes)");
      return;
    }

    const qCount = Number(totalQuestions);
    if (!Number.isFinite(qCount) || qCount <= 0 || !Number.isInteger(qCount)) {
      setError("Number of questions must be a positive integer");
      return;
    }

    if (Number.isFinite(maxTotalQuestions) && qCount > maxTotalQuestions) {
      setError(`Number of questions must be ${maxTotalQuestions} or less`);
      return;
    }

    const tCount = Number(termCount);
    if (!Number.isFinite(tCount) || !Number.isInteger(tCount) || tCount < 1 || tCount > 12) {
      setError("Terms per question must be an integer between 1 and 12");
      return;
    }

    const dm = String(digitsMode || "").trim().toUpperCase();
    if (!dm) {
      setError("Select a digit mode");
      return;
    }

    if (tCount > 1 && !safeSelectedOps.length) {
      setError("Select at least one operation");
      return;
    }

    setIsSubmitting(true);
    try {
      const resp = await createStudentAbacusPracticeWorksheet({
        timeLimitSeconds: mins * 60,
        termCount: tCount,
        digitsMode: dm,
        operations: tCount > 1 ? safeSelectedOps : [],
        totalQuestions: qCount
      });

      const worksheetId = resp?.data?.data?.worksheetId;
      if (!worksheetId) {
        throw new Error("Practice worksheet created but worksheetId missing");
      }

      navigate(`/student/worksheets/${worksheetId}`);
    } catch (e2) {
      const status = e2?.response?.status;
      const code = e2?.response?.data?.error_code;

      if (status === 401 || code === "INVALID_ACCESS_TOKEN" || code === "AUTH_REQUIRED") {
        // Match attempt page behavior: stop retry loops and force a clean re-login.
        try {
          localStorage.removeItem("abacus_access_token");
          localStorage.removeItem("abacus_refresh_token");
        } catch {
          // ignore
        }
        if (typeof logout === "function") {
          try {
            await logout();
          } catch {
            // ignore
          }
        }
        setError("Session expired. Please log in again.");
        navigate("/login", { replace: true, state: { from: "/student/abacus-practice" } });
        return;
      }

      setError(e2?.response?.data?.message || e2?.message || "Failed to start abacus practice");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Abacus Practice (Auto)</h1>
          <div className="muted">{level ? `Level ${level.rank}: ${level.name}` : ""}</div>
        </div>
      </div>

      {isLoading ? (
        <div className="card">Loading…</div>
      ) : !hasAbacusPracticeAccess ? (
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
                onChange={(e2) => setTotalQuestions(e2.target.value)}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Max: <strong>{maxTotalQuestions}</strong>
              </div>
            </label>

            <label className="form-field">
              <span className="form-label">Time (minutes)</span>
              <input
                className="input"
                type="number"
                min={1}
                step={1}
                value={minutes}
                onChange={(e3) => setMinutes(e3.target.value)}
              />
            </label>

            <label className="form-field">
              <span className="form-label">Terms per question</span>
              <input
                className="input"
                type="number"
                min={1}
                max={12}
                step={1}
                value={termCount}
                onChange={(e4) => setTermCount(e4.target.value)}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                Examples: 3 → <strong>22 + 23 + 24</strong>, 5 → <strong>56 + 1 + 15 + 45 + 85</strong>
              </div>
            </label>

            <label className="form-field">
              <span className="form-label">Digits</span>
              <select
                className="input"
                value={digitsMode}
                onChange={(e5) => setDigitsMode(e5.target.value)}
              >
                {availableDigitsModes.includes("DIGIT_1") ? (
                  <option value="DIGIT_1">1 digit (0–9)</option>
                ) : null}
                {availableDigitsModes.includes("DIGIT_2") ? (
                  <option value="DIGIT_2">2 digits (10-99)/Duplex Numbers</option>
                ) : null}
                {availableDigitsModes.includes("DIGIT_3") ? (
                  <option value="DIGIT_3">Max 3 digits (0–999)</option>
                ) : null}
                {availableDigitsModes.includes("SMALL_FRIENDS") ? (
                  <option value="SMALL_FRIENDS">Small Friends</option>
                ) : null}
                {availableDigitsModes.includes("LOWER_DECK_1_4") ? (
                  <option value="LOWER_DECK_1_4">Digit (1–4) Lower Deck</option>
                ) : null}
                {availableDigitsModes.includes("LOWER_DECK_TENS_10_40") ? (
                  <option value="LOWER_DECK_TENS_10_40">Tens Numbers Lower Deck</option>
                ) : null}
                {availableDigitsModes.includes("UPPER_DECK_1_9") ? (
                  <option value="UPPER_DECK_1_9">Digit (1–9) Upper Deck</option>
                ) : null}
                {availableDigitsModes.includes("UPPER_DECK_TENS_50_90") ? (
                  <option value="UPPER_DECK_TENS_50_90">Tens Numbers Upper Deck</option>
                ) : null}
              </select>
            </label>
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
              <div className="form-label">Operations</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={selectAllOps}>
                  Select all
                </button>
                <button className="button secondary" type="button" style={{ width: "auto", padding: "6px 10px" }} onClick={clearAllOps}>
                  Clear
                </button>
              </div>
            </div>

            <div className="chip-row">
              {availableOps.map((op) => (
                <label key={op} className="chip">
                  <input
                    type="checkbox"
                    disabled={Number(termCount) <= 1}
                    checked={safeSelectedOps.includes(String(op).trim().toUpperCase())}
                    onChange={() => onToggleOp(op)}
                  />
                  <span>{opLabel(op)}</span>
                </label>
              ))}
            </div>

            {isLowerDeckMode ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Lower Deck (1–4) uses only <strong>Add</strong> and <strong>Less</strong>, with answers always &gt; 0.
              </div>
            ) : null}

            {isTensLowerDeckMode ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Tens Numbers Lower Deck uses only <strong>Add</strong> and <strong>Less</strong>, with answers always between <strong>10</strong> and <strong>40</strong>.
              </div>
            ) : null}

            {isUpperDeckMode ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Upper Deck (1–9) uses only <strong>Add</strong> and <strong>Less</strong>, with answers always between <strong>1</strong> and <strong>9</strong>.
              </div>
            ) : null}

            {isTensUpperDeckMode ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Tens Numbers Upper Deck uses only <strong>Add</strong> and <strong>Less</strong>, with answers always between <strong>50</strong> and <strong>90</strong>.
              </div>
            ) : null}

            {isSmallFriendsMode ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Small Friends uses only <strong>Add</strong> and <strong>Less</strong> and generates patterns that use friends of <strong>5</strong> (1↔4, 2↔3).
              </div>
            ) : null}

            {Number(termCount) <= 1 ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Operations are used only when Terms per question is 2 or more.
              </div>
            ) : null}
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

export { StudentAbacusPracticeWorksheetPage };
