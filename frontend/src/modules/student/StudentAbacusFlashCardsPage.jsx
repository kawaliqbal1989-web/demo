import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import {
  ArenaMobileHandoff,
  getArenaQueryNumber,
  getArenaQueryValue
} from "../../components/ArenaMobileHandoff";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];

const MODES = [
  {
    id: "number-flash",
    title: "Number Flash",
    description: "Remember the number before the card disappears."
  },
  {
    id: "abacus-flash",
    title: "Flash Card Manual",
    description: "Read one abacus card and enter the answer before moving to the next card."
  },
  {
    id: "abacus-auto",
    title: "Flash Card Automatic",
    description: "Read each abacus card automatically, write answers on paper, then check them at the end."
  }
];

// Old mode ids remain readable for already-created QR tasks, but they are
// no longer offered as student choices.
const SUPPORTED_MODE_IDS = [
  ...MODES.map((item) => item.id),
  "build-number",
  "operation-flash"
];

const DIGIT_OPTIONS = Array.from({ length: 10 }, (_, index) => index + 1);
const CARD_COUNTS = [5, 10, 20];

const FLASH_DURATIONS = [
  { value: 3000, label: "3 sec" },
  { value: 2000, label: "2 sec" },
  { value: 1000, label: "1 sec" },
  { value: 500, label: "0.5 sec" }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function numberRangeForDigits(digits) {
  const safeDigits = Math.max(1, Math.min(10, Number(digits) || 1));
  return {
    min: safeDigits === 1 ? 1 : 10 ** (safeDigits - 1),
    max: (10 ** safeDigits) - 1
  };
}

function makeValue(digits) {
  const { min, max } = numberRangeForDigits(digits);
  return randomInt(min, max);
}

function createCard(mode, digits, operationMode) {
  if (mode === "operation-flash") {
    let left = makeValue(digits);
    let right = makeValue(digits);

    let operation = operationMode;
    if (operation === "mixed") {
      operation = Math.random() < 0.5 ? "addition" : "subtraction";
    }

    if (operation === "subtraction" && right > left) {
      [left, right] = [right, left];
    }

    const correctAnswer =
      operation === "addition"
        ? left + right
        : left - right;

    return {
      display: `${left.toLocaleString("en-US")} ${operation === "addition" ? "+" : "−"} ${right.toLocaleString("en-US")}`,
      correctAnswer,
      targetValue: correctAnswer
    };
  }

  const value = makeValue(digits);

  return {
    display: value.toLocaleString("en-US"),
    correctAnswer: value,
    targetValue: value
  };
}

function parseNumericAnswer(value) {
  const normalized = String(value ?? "")
    .replace(/,/g, "")
    .trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function StudentAbacusFlashCardsPage({
  mobileTaskMode = false,
  mobileTaskConfig = null,
  onMobileTaskComplete = null
}) {
  const abacusRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const mobileAutoStartRef = useRef(false);
  const mobileCompleteNotifiedRef = useRef(false);
  const mobileQuery = useMemo(
    () => new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    ),
    []
  );

  const preparedConfig = useMemo(
    () => (
      mobileTaskMode &&
      mobileTaskConfig &&
      typeof mobileTaskConfig === "object"
        ? mobileTaskConfig
        : null
    ),
    [mobileTaskConfig, mobileTaskMode]
  );

  const [mode, setMode] = useState(() =>
    preparedConfig
      ? getArenaQueryValue(
          new URLSearchParams({
            mode: String(preparedConfig.mode || "")
          }),
          "mode",
          SUPPORTED_MODE_IDS,
          "number-flash"
        )
      : getArenaQueryValue(
          mobileQuery,
          "mode",
          SUPPORTED_MODE_IDS,
          "number-flash"
        )
  );
  const [digits, setDigits] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            digits: String(preparedConfig.digits ?? "")
          }),
          "digits",
          DIGIT_OPTIONS,
          2
        )
      : getArenaQueryNumber(mobileQuery, "digits", DIGIT_OPTIONS, 2)
  );
  const [cardCount, setCardCount] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            cardCount: String(preparedConfig.cardCount ?? "")
          }),
          "cardCount",
          CARD_COUNTS,
          10
        )
      : getArenaQueryNumber(mobileQuery, "cardCount", CARD_COUNTS, 10)
  );
  const [flashDuration, setFlashDuration] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            flashDuration: String(preparedConfig.flashDuration ?? "")
          }),
          "flashDuration",
          FLASH_DURATIONS.map((item) => item.value),
          1000
        )
      : getArenaQueryNumber(
          mobileQuery,
          "flashDuration",
          FLASH_DURATIONS.map((item) => item.value),
          1000
        )
  );
  const [operationMode, setOperationMode] = useState(() =>
    preparedConfig
      ? getArenaQueryValue(
          new URLSearchParams({
            operationMode: String(preparedConfig.operationMode || "")
          }),
          "operationMode",
          ["addition", "subtraction", "mixed"],
          "mixed"
        )
      : getArenaQueryValue(
          mobileQuery,
          "operationMode",
          ["addition", "subtraction", "mixed"],
          "mixed"
        )
  );

  const [phase, setPhase] = useState("setup");
  const [cardIndex, setCardIndex] = useState(0);
  const [card, setCard] = useState(null);
  const [answer, setAnswer] = useState("");
  const [abacusValue, setAbacusValue] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState([]);
  const [automaticCards, setAutomaticCards] = useState([]);
  const [paperAnswers, setPaperAnswers] = useState([]);
  const [automaticReviewMode, setAutomaticReviewMode] = useState("choice");

  const isBuildMode = mode === "build-number";
  const isAutomaticFlash = mode === "abacus-auto";
  const isAbacusFlash =
    mode === "abacus-flash" ||
    isAutomaticFlash;

  const prepareCard = (nextIndex) => {
    const nextCard = createCard(mode, digits, operationMode);

    setCardIndex(nextIndex);
    setCard(nextCard);
    setAnswer("");
    setAbacusValue(0);
    setFeedback(null);
    startedAtRef.current = Date.now();

    if (isBuildMode) {
      setPhase("answering");
      window.requestAnimationFrame(() => {
        abacusRef.current?.loadValue(0);
      });
    } else {
      setPhase("showing");

      if (isAbacusFlash) {
        window.requestAnimationFrame(() => {
          abacusRef.current?.loadValue(nextCard.targetValue);
        });
      }
    }
  };

  const startSession = () => {
    setResults([]);
    setAutomaticCards([]);
    setPaperAnswers([]);
    setAutomaticReviewMode("choice");
    prepareCard(0);
  };

  useEffect(() => {
    if (!mobileTaskMode || mobileAutoStartRef.current) {
      return;
    }

    mobileAutoStartRef.current = true;
    startSession();
  }, [mobileTaskMode]);

  useEffect(() => {
    if (phase !== "showing") return undefined;

    const timer = window.setTimeout(() => {
      if (isAutomaticFlash && card) {
        const completedCard = {
          cardNumber: cardIndex + 1,
          prompt: card.display,
          correctAnswer: card.correctAnswer
        };

        setAutomaticCards((current) => [
          ...current,
          completedCard
        ]);

        if (cardIndex + 1 >= cardCount) {
          setPaperAnswers(
            Array.from({ length: cardCount }, () => "")
          );
          setAutomaticReviewMode("choice");
          setPhase("automatic-review");
          return;
        }

        prepareCard(cardIndex + 1);
        return;
      }

      setPhase("answering");
    }, flashDuration);

    return () => window.clearTimeout(timer);
  }, [
    card,
    cardCount,
    cardIndex,
    flashDuration,
    isAutomaticFlash,
    phase
  ]);

  const submitAnswer = () => {
    if (!card || phase !== "answering") return;

    const submittedValue = isBuildMode
      ? abacusValue
      : parseNumericAnswer(answer);

    if (submittedValue === null) {
      setFeedback({
        correct: false,
        message: "Enter a valid number before checking."
      });
      return;
    }

    const correct = submittedValue === card.correctAnswer;

    const result = {
      cardNumber: cardIndex + 1,
      prompt: card.display,
      submittedValue,
      correctAnswer: card.correctAnswer,
      correct,
      elapsedMs: Math.max(0, Date.now() - startedAtRef.current)
    };

    setResults((current) => [...current, result]);

    setFeedback({
      correct,
      message: correct
        ? "Correct! Great work."
        : `Not quite. Correct answer: ${card.correctAnswer.toLocaleString("en-US")}`
    });

    setPhase("feedback");
  };

  const nextCard = () => {
    if (cardIndex + 1 >= cardCount) {
      setPhase("complete");
      return;
    }

    prepareCard(cardIndex + 1);
  };

  const submitAutomaticAnswers = () => {
    const nextResults = automaticCards.map(
      (automaticCard, index) => {
        const submittedValue =
          parseNumericAnswer(paperAnswers[index]);

        return {
          cardNumber: automaticCard.cardNumber,
          prompt: automaticCard.prompt,
          submittedValue,
          correctAnswer: automaticCard.correctAnswer,
          correct:
            submittedValue !== null &&
            submittedValue === automaticCard.correctAnswer,
          elapsedMs: 0
        };
      }
    );

    setResults(nextResults);
    setPhase("complete");
  };

  useEffect(() => {
    const handleArenaEnter = (event) => {
      if (event.key !== "Enter" || event.repeat) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, a, input, textarea, select")
      ) {
        return;
      }

      if (phase === "feedback") {
        event.preventDefault();
        nextCard();
        return;
      }

      if (phase === "answering" && isBuildMode) {
        event.preventDefault();
        submitAnswer();
      }
    };

    window.addEventListener("keydown", handleArenaEnter);
    return () => window.removeEventListener("keydown", handleArenaEnter);
  }, [
    phase,
    isBuildMode,
    cardIndex,
    cardCount,
    results,
    abacusValue
  ]);

  const correctCount = useMemo(
    () => results.filter((result) => result.correct).length,
    [results]
  );

  const wrongCount = results.length - correctCount;

  const accuracy = results.length
    ? Math.round((correctCount / results.length) * 100)
    : 0;

  useEffect(() => {
    if (
      !mobileTaskMode ||
      phase !== "complete" ||
      mobileCompleteNotifiedRef.current ||
      typeof onMobileTaskComplete !== "function"
    ) {
      return;
    }

    mobileCompleteNotifiedRef.current = true;

    const totalResponseMs = results.reduce(
      (total, result) =>
        total + Math.max(0, Number(result.elapsedMs) || 0),
      0
    );

    onMobileTaskComplete({
      attemptCount: results.length,
      correctCount,
      durationMs: Math.min(86_400_000, totalResponseMs),
      metrics: {
        digits,
        cardCount,
        flashDurationMs: flashDuration,
        ...(mode === "operation-flash" ? { operationMode } : {}),
        source: "arena-mobile-companion"
      }
    });
  }, [
    cardCount,
    correctCount,
    digits,
    flashDuration,
    mobileTaskMode,
    mode,
    onMobileTaskComplete,
    operationMode,
    phase,
    results
  ]);

  const sessionMessage =
    accuracy >= 90
      ? "Excellent visual recall. Keep the rhythm going with another quick round."
      : accuracy >= 70
        ? "Good progress. Another round can make the cards feel faster and more automatic."
        : "Review the missed cards, then repeat the same settings to strengthen recall.";

  const progress = Math.min(
    100,
    Math.round(
      (
        (
          cardIndex +
          (["complete", "automatic-review"].includes(phase)
            ? 1
            : 0)
        ) /
        cardCount
      ) *
      100
    )
  );

  const resetToSetup = () => {
    setPhase("setup");
    setCard(null);
    setAnswer("");
    setFeedback(null);
    setResults([]);
    setAutomaticCards([]);
    setPaperAnswers([]);
    setAutomaticReviewMode("choice");
    setCardIndex(0);
    setAbacusValue(0);
  };

  if (mobileTaskMode && phase === "setup") {
    return (
      <div className="arena-mobile-state">
        <div className="arena-mobile-spinner" aria-hidden="true" />
        <h2>Preparing Flash Cards…</h2>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Flash Cards</h1>
            <div className="muted">
              Train visual number recall and abacus reading with manual or automatic flash cards.
            </div>
          </div>

          <Link
            className="button secondary"
            to="/student/virtual-abacus/arena"
            style={{ width: "auto" }}
          >
            Back to Arena
          </Link>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Choose a Training Mode</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginTop: 12
            }}
          >
            {MODES.map((item) => (
              <button
                key={item.id}
                className={`button secondary ${mode === item.id ? "va-is-active" : ""}`}
                type="button"
                onClick={() => setMode(item.id)}
                style={{
                  textAlign: "left",
                  minHeight: 120,
                  whiteSpace: "normal"
                }}
              >
                <strong>{item.title}</strong>
                <div
                  className="muted"
                  style={{ marginTop: 6, fontWeight: 400 }}
                >
                  {item.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Session Settings</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 16,
              marginTop: 16
            }}
          >
            <label>
              <strong>Digits</strong>
              <select
                className="input"
                value={digits}
                onChange={(event) => setDigits(Number(event.target.value))}
                style={{ marginTop: 8 }}
              >
                {DIGIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value} digit{value === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <strong>Cards</strong>
              <select
                className="input"
                value={cardCount}
                onChange={(event) => setCardCount(Number(event.target.value))}
                style={{ marginTop: 8 }}
              >
                {CARD_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} cards
                  </option>
                ))}
              </select>
            </label>

            {!isBuildMode ? (
              <label>
                <strong>Flash Speed</strong>
                <select
                  className="input"
                  value={flashDuration}
                  onChange={(event) => setFlashDuration(Number(event.target.value))}
                  style={{ marginTop: 8 }}
                >
                  {FLASH_DURATIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {mode === "operation-flash" ? (
              <label>
                <strong>Operations</strong>
                <select
                  className="input"
                  value={operationMode}
                  onChange={(event) => setOperationMode(event.target.value)}
                  style={{ marginTop: 8 }}
                >
                  <option value="addition">Addition</option>
                  <option value="subtraction">Subtraction</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
            ) : null}
          </div>

          <button
            className="button"
            type="button"
            onClick={startSession}
            style={{ marginTop: 20, width: "auto" }}
          >
            Start Flash Cards
          </button>

          <ArenaMobileHandoff
            title="Flash Cards"
            activityKey="flash-cards"
            config={{
              mode,
              digits,
              cardCount,
              flashDuration,
              operationMode
            }}
            buttonLabel="📱 Start Flash Cards on Mobile"
          />
        </div>
      </div>
    );
  }

  if (phase === "automatic-review") {
    const enteringAnswers =
      automaticReviewMode === "answers";
    const showingAnswerKey =
      automaticReviewMode === "key";

    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Flash Card Automatic</h1>
            <div className="muted">
              Automatic display finished. Your answers stay on
              paper until you choose how to check them.
            </div>
          </div>

          {!mobileTaskMode ? (
            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena"
              style={{ width: "auto" }}
            >
              Back to Arena
            </Link>
          ) : null}
        </div>

        {!enteringAnswers && !showingAnswerKey ? (
          <div className="card">
            <h2>Check Your Paper</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Enter the answers you wrote to receive a temporary
              Score Card, or reveal the answer key and compare
              directly with your paper.
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 18
              }}
            >
              <button
                className="button"
                type="button"
                onClick={() =>
                  setAutomaticReviewMode("answers")
                }
                style={{ width: "auto" }}
              >
                Enter My Answers
              </button>

              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setAutomaticReviewMode("key")
                }
                style={{ width: "auto" }}
              >
                Show Correct Answers
              </button>
            </div>

            <div className="muted" style={{ marginTop: 14 }}>
              Temporary practice only. This Score Card is not
              added to Arena progress.
            </div>
          </div>
        ) : null}

        {enteringAnswers ? (
          <div className="card">
            <h2>Enter Paper Answers</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Enter the answer written for each card. Blank
              answers will be counted as wrong.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
                marginTop: 18
              }}
            >
              {automaticCards.map((automaticCard, index) => (
                <label key={automaticCard.cardNumber}>
                  <strong>
                    Card {automaticCard.cardNumber}
                  </strong>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    value={paperAnswers[index] ?? ""}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setPaperAnswers((current) =>
                        current.map((value, answerIndex) =>
                          answerIndex === index
                            ? nextValue
                            : value
                        )
                      );
                    }}
                    placeholder="Your paper answer"
                    style={{ marginTop: 8 }}
                  />
                </label>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginTop: 18
              }}
            >
              <button
                className="button"
                type="button"
                onClick={submitAutomaticAnswers}
                style={{ width: "auto" }}
              >
                View Temporary Score Card
              </button>

              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setAutomaticReviewMode("key")
                }
                style={{ width: "auto" }}
              >
                Show Correct Answers
              </button>
            </div>
          </div>
        ) : null}

        {showingAnswerKey ? (
          <div className="card">
            <h2>Correct Answers</h2>
            <div className="muted" style={{ marginTop: 6 }}>
              Match these values with the answers written on
              your paper.
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 10,
                marginTop: 16
              }}
            >
              {automaticCards.map((automaticCard) => (
                <div
                  key={automaticCard.cardNumber}
                  style={{
                    border:
                      "1px solid var(--border, #e5e7eb)",
                    borderRadius: 10,
                    padding: 12
                  }}
                >
                  <div className="muted">
                    Card {automaticCard.cardNumber}
                  </div>
                  <strong style={{ fontSize: 20 }}>
                    {automaticCard.correctAnswer.toLocaleString(
                      "en-US"
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <button
              className="button secondary"
              type="button"
              onClick={() =>
                setAutomaticReviewMode("answers")
              }
              style={{ width: "auto", marginTop: 18 }}
            >
              Enter My Answers
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (mobileTaskMode && phase === "complete") {
    return (
      <div className="arena-mobile-state">
        <div className="arena-mobile-spinner" aria-hidden="true" />
        <h2>Submitting your Flash Cards result…</h2>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Temporary Score Card</h1>
            <div className="muted">
              Session complete. This Score Card is temporary and is not saved to Arena progress.
            </div>
          </div>
        </div>

        <div
          style={{
            borderRadius: 24,
            padding: "22px 24px",
            marginBottom: 16,
            color: "#ffffff",
            background:
              "linear-gradient(135deg, #0891b2 0%, #2563eb 48%, #7c3aed 100%)",
            boxShadow: "0 18px 38px rgba(37, 99, 235, 0.18)"
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 18
            }}
          >
            <div style={{ minWidth: 220 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  opacity: 0.78
                }}
              >
                FLASH CARD SESSION COMPLETE
              </div>

              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 30,
                  margin: "7px 0 6px"
                }}
              >
                {accuracy}% accuracy
              </h2>

              <div
                style={{
                  maxWidth: 620,
                  lineHeight: 1.55,
                  opacity: 0.88
                }}
              >
                {sessionMessage}
              </div>

            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(100px, 1fr))",
                gap: 8,
                minWidth: 230
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.20)"
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.76 }}>
                  Correct
                </div>
                <strong style={{ fontSize: 21 }}>
                  {correctCount}/{results.length}
                </strong>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.14)",
                  border: "1px solid rgba(255,255,255,0.20)"
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.76 }}>
                  Missed
                </div>
                <strong style={{ fontSize: 21 }}>
                  {wrongCount}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 16
          }}
        >
          <div className="card">
            <div className="muted">Cards</div>
            <h2>{results.length}</h2>
          </div>

          <div className="card">
            <div className="muted">Correct</div>
            <h2>{correctCount}</h2>
          </div>

          <div className="card">
            <div className="muted">Wrong</div>
            <h2>{wrongCount}</h2>
          </div>

          <div className="card">
            <div className="muted">Accuracy</div>
            <h2>{accuracy}%</h2>
          </div>
        </div>

        {wrongCount > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>Review Missed Cards</h2>

            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {results
                .filter((result) => !result.correct)
                .map((result) => (
                  <div
                    key={result.cardNumber}
                    style={{
                      border: "1px solid var(--border, #e5e7eb)",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <strong>Card {result.cardNumber}: {result.prompt}</strong>
                    <div className="muted" style={{ marginTop: 4 }}>
                      Your answer: {result.submittedValue === null
                        ? "Blank"
                        : result.submittedValue.toLocaleString("en-US")}
                      {" · "}
                      Correct: {result.correctAnswer.toLocaleString("en-US")}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        <div
          className="card"
          style={{
            marginTop: 16,
            padding: 18
          }}
        >
          <div>
            <strong style={{ fontSize: 18 }}>
              Keep the session moving
            </strong>
            <div
              className="muted"
              style={{ marginTop: 4 }}
            >
              Repeat these cards or continue with Display Dictation or Audio Dictation.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(175px, 1fr))",
              gap: 10,
              marginTop: 14
            }}
          >
            <button
              className="button"
              type="button"
              onClick={startSession}
              style={{ minHeight: 48 }}
            >
              🎴 Play Again
            </button>

            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena/flash-anzan"
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ⚡ Display Dictation
            </Link>

            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena/audio-anzan"
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              🔊 Audio Dictation
            </Link>


          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginTop: 12
            }}
          >
            <button
              className="button secondary"
              type="button"
              onClick={resetToSetup}
              style={{ width: "auto" }}
            >
              Change Settings
            </button>

            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena"
              style={{ width: "auto" }}
            >
              Back to Arena
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Flash Cards</h1>
          <div className="muted">
            Card {cardIndex + 1} of {cardCount}
          </div>
        </div>

        <button
          className="button secondary"
          type="button"
          onClick={resetToSetup}
          style={{ width: "auto" }}
        >
          End Session
        </button>
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          background: "var(--border, #e5e7eb)",
          marginBottom: 16
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "currentColor",
            opacity: 0.65
          }}
        />
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        {phase === "showing" && mode === "number-flash" ? (
          <>
            <div className="muted">Remember this number</div>
            <div
              style={{
                fontSize: "clamp(3rem, 11vw, 7rem)",
                fontWeight: 800,
                margin: "36px 0"
              }}
            >
              {card?.display}
            </div>
          </>
        ) : null}

        {phase === "showing" && mode === "operation-flash" ? (
          <>
            <div className="muted">Remember and solve</div>
            <div
              style={{
                fontSize: "clamp(2.5rem, 9vw, 6rem)",
                fontWeight: 800,
                margin: "36px 0"
              }}
            >
              {card?.display}
            </div>
          </>
        ) : null}

        {phase === "showing" && isAbacusFlash ? (
          <>
            <div className="muted" style={{ marginBottom: 14 }}>
              Read the abacus before it disappears
            </div>

            <VirtualAbacus
              ref={abacusRef}
              columns={16}
              fractionalRods={6}
              markerExponents={STANDARD_PLACE_MARKERS}
              showValue={false}
              showLabels={false}
              showReset={false}
              interactive={false}
            />
          </>
        ) : null}

        {phase === "answering" && isBuildMode ? (
          <>
            <div className="muted">Build this number</div>

            <div
              style={{
                fontSize: "clamp(2.2rem, 8vw, 5rem)",
                fontWeight: 800,
                margin: "18px 0"
              }}
            >
              {card?.display}
            </div>

            <VirtualAbacus
              ref={abacusRef}
              columns={16}
              fractionalRods={6}
              markerExponents={STANDARD_PLACE_MARKERS}
              showValue
              showLabels={false}
              showReset
              interactive
              onValueChange={(value) => setAbacusValue(value)}
            />

            <button
              className="button"
              type="button"
              onClick={submitAnswer}
              style={{ marginTop: 18, width: "auto" }}
            >
              Check Abacus
            </button>
          </>
        ) : null}

        {phase === "answering" && !isBuildMode ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitAnswer();
            }}
          >
            <div className="muted" style={{ marginBottom: 12 }}>
              {mode === "abacus-flash"
                ? "What number did the abacus show?"
                : mode === "operation-flash"
                  ? "What is the answer?"
                  : "What number did you see?"}
            </div>

            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Enter answer"
              style={{
                maxWidth: 360,
                margin: "0 auto",
                textAlign: "center",
                fontSize: "2rem"
              }}
            />

            <div style={{ marginTop: 16 }}>
              <button
                className="button"
                type="submit"
                style={{ width: "auto" }}
              >
                Check Answer
              </button>
            </div>
          </form>
        ) : null}

        {phase === "feedback" ? (
          <div aria-live="polite">
            <div
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                marginBottom: 8
              }}
            >
              {feedback?.message}
            </div>

            {!feedback?.correct && mode !== "operation-flash" ? (
              <div className="muted">
                Card value: {card?.correctAnswer.toLocaleString("en-US")}
              </div>
            ) : null}

            <button
              className="button"
              type="button"
              onClick={nextCard}
              style={{ marginTop: 20, width: "auto" }}
            >
              {cardIndex + 1 >= cardCount ? "View Results" : "Next Card"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { StudentAbacusFlashCardsPage };
