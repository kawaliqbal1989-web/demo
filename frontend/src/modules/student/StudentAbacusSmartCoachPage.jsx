import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import {
  listStudentArenaSessions,
  recordStudentArenaSession
} from "../../services/studentArenaService";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];

const DIGIT_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const QUESTION_COUNTS = [5, 10, 20];

function randomTarget(
  digits,
  focusExponent = null
) {
  const safeDigits = Math.max(
    1,
    Math.min(7, Number(digits) || 1)
  );

  const min =
    safeDigits === 1
      ? 1
      : 10 ** (safeDigits - 1);

  const max = (10 ** safeDigits) - 1;

  let target =
    Math.floor(
      Math.random() * (max - min + 1)
    ) + min;

  const validFocus =
    Number.isInteger(focusExponent) &&
    focusExponent >= 0 &&
    focusExponent < safeDigits;

  if (validFocus) {
    const place =
      10 ** focusExponent;

    const currentDigit =
      Math.floor(target / place) % 10;

    if (currentDigit === 0) {
      const replacementDigit =
        1 + Math.floor(Math.random() * 9);

      target +=
        replacementDigit * place;
    }
  }

  return target;
}

function getAdaptiveFocus(
  mistakeCounts,
  digits
) {
  let bestExponent = null;
  let bestCount = 0;

  for (
    let exponent = 0;
    exponent < digits;
    exponent += 1
  ) {
    const count =
      Number(
        mistakeCounts?.[exponent]
      ) || 0;

    if (count > bestCount) {
      bestCount = count;
      bestExponent = exponent;
    }
  }

  return bestExponent;
}

function formatValue(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(Number(value || 0));
}

function sameValue(left, right) {
  return (
    Math.round(Number(left || 0) * 1_000_000) ===
    Math.round(Number(right || 0) * 1_000_000)
  );
}

function digitAtExponent(value, exponent) {
  const numeric = Math.abs(
    Math.round(Number(value || 0))
  );

  return Math.floor(
    numeric / (10 ** exponent)
  ) % 10;
}

function coachForValue(target, current, digits) {
  const difference = target - current;
  const mismatches = [];

  for (
    let exponent = digits - 1;
    exponent >= 0;
    exponent -= 1
  ) {
    const currentDigit =
      digitAtExponent(current, exponent);

    const targetDigit =
      digitAtExponent(target, exponent);

    if (currentDigit !== targetDigit) {
      mismatches.push({
        exponent,
        currentDigit,
        targetDigit,
        adjustment:
          targetDigit - currentDigit
      });
    }
  }

  let summary =
    "Your abacus matches the target.";

  if (difference > 0) {
    summary =
      `You are ${formatValue(difference)} short.`;
  }

  if (difference < 0) {
    summary =
      `You are ${formatValue(
        Math.abs(difference)
      )} over.`;
  }

  return {
    summary,
    mismatches
  };
}

function buildMistakePracticeQueue(
  mistakeCounts,
  digits,
  limit = 10
) {
  const safeDigits = Math.max(
    1,
    Math.min(7, Number(digits) || 1)
  );

  const ranked = Object.entries(
    mistakeCounts || {}
  )
    .map(([rawExponent, rawCount]) => ({
      exponent: Number(rawExponent),
      count: Number(rawCount) || 0
    }))
    .filter(
      (item) =>
        Number.isInteger(item.exponent) &&
        item.exponent >= 0 &&
        item.exponent < safeDigits &&
        item.count > 0
    )
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.exponent - right.exponent
    );

  const queue = [];

  ranked.forEach((item) => {
    const repetitions = Math.min(
      3,
      item.count
    );

    for (
      let index = 0;
      index < repetitions;
      index += 1
    ) {
      queue.push(item.exponent);

      if (queue.length >= limit) {
        return;
      }
    }
  });

  return queue.slice(0, limit);
}

function aggregateHistoricalMistakeCounts(
  sessions,
  digits
) {
  const safeDigits = Math.max(
    1,
    Math.min(7, Number(digits) || 1)
  );

  const counts = {};

  (Array.isArray(sessions) ? sessions : [])
    .filter(
      (session) =>
        Number(session?.metrics?.digits) === safeDigits &&
        session?.metrics?.mistakeCounts &&
        typeof session.metrics.mistakeCounts === "object" &&
        !Array.isArray(session.metrics.mistakeCounts)
    )
    .forEach((session) => {
      Object.entries(
        session.metrics.mistakeCounts
      ).forEach(
        ([rawExponent, rawCount]) => {
          const exponent = Number(rawExponent);
          const count = Number(rawCount);

          if (
            Number.isInteger(exponent) &&
            exponent >= 0 &&
            exponent < safeDigits &&
            Number.isFinite(count) &&
            count > 0
          ) {
            counts[exponent] =
              (Number(counts[exponent]) || 0) +
              Math.floor(count);
          }
        }
      );
    });

  return counts;
}

function placeLabel(exponent) {
  const labels = {
    0: "Units",
    1: "Tens",
    2: "Hundreds",
    3: "Thousands",
    4: "Ten Thousands"
  };

  return (
    labels[exponent] ||
    `10^${exponent}`
  );
}

function emptyStats() {
  return {
    solved: 0,
    firstCheckCorrect: 0,
    totalMoves: 0,
    totalTimeMs: 0,
    wrongChecks: 0
  };
}

function StudentAbacusSmartCoachPage({
  adaptiveMode = false
} = {}) {
  const abacusRef = useRef(null);
  const correctAbacusRef = useRef(null);
  const startedAtRef = useRef(Date.now());
  const replayTimerRef = useRef(null);
  const sessionSaveStartedRef = useRef(false);

  const [digits, setDigits] =
    useState(2);

  const [questionCount, setQuestionCount] =
    useState(5);

  const [trainingMode, setTrainingMode] =
    useState(adaptiveMode ? "focus" : "guided");

  const [focusSelection, setFocusSelection] =
    useState("auto");

  const [showCorrectAbacus, setShowCorrectAbacus] =
    useState(false);

  const [phase, setPhase] =
    useState("setup");

  const [questionIndex, setQuestionIndex] =
    useState(0);

  const [target, setTarget] =
    useState(0);

  const [currentValue, setCurrentValue] =
    useState(0);

  const [moves, setMoves] =
    useState([]);

  const [checks, setChecks] =
    useState(0);

  const [feedback, setFeedback] =
    useState(null);

  const [showMoves, setShowMoves] =
    useState(false);

  const [mistakeReplay, setMistakeReplay] =
    useState(null);

  const [replaying, setReplaying] =
    useState(false);

  const [replayStep, setReplayStep] =
    useState(0);

  const [results, setResults] =
    useState([]);

  const [stats, setStats] =
    useState(emptyStats);

  const [
    mistakeCounts,
    setMistakeCounts
  ] = useState({});

  const [
    mistakePracticeQueue,
    setMistakePracticeQueue
  ] = useState([]);

  const [
    historicalMistakeSessions,
    setHistoricalMistakeSessions
  ] = useState([]);

  const [
    historicalMistakesLoading,
    setHistoricalMistakesLoading
  ] = useState(true);

  const [
    historicalMistakesError,
    setHistoricalMistakesError
  ] = useState(null);

  const [
    historicalMistakesReloadKey,
    setHistoricalMistakesReloadKey
  ] = useState(0);

  const [
    mistakePracticeActive,
    setMistakePracticeActive
  ] = useState(false);

  const effectiveTrainingMode = trainingMode;

  const manualFocusExponent =
    effectiveTrainingMode === "focus" &&
    focusSelection !== "auto" &&
    Number.isInteger(Number(focusSelection)) &&
    Number(focusSelection) >= 0 &&
    Number(focusSelection) < digits
      ? Number(focusSelection)
      : null;

  const adaptiveFocusExponent =
    effectiveTrainingMode === "focus" &&
    focusSelection === "auto"
      ? getAdaptiveFocus(
          mistakeCounts,
          digits
        )
      : null;

  const activeFocusExponent =
    Number.isInteger(manualFocusExponent)
      ? manualFocusExponent
      : adaptiveFocusExponent;

  const pageTitle =
    mistakePracticeActive
      ? "Fix My Mistakes"
      : "Smart Coach";

  const activeQuestionCount =
    mistakePracticeActive
      ? mistakePracticeQueue.length
      : questionCount;

  const historicalMistakeCounts =
    aggregateHistoricalMistakeCounts(
      historicalMistakeSessions,
      digits
    );

  const historicalMistakeQueue =
    buildMistakePracticeQueue(
      historicalMistakeCounts,
      digits
    );

  const highlightedCoachExponents = Array.from(
    new Set(
      (
        Array.isArray(feedback?.coach?.mismatches)
          ? feedback.coach.mismatches
          : []
      )
        .map((item) => Number(item?.exponent))
        .filter(
          (exponent) =>
            Number.isInteger(exponent) &&
            exponent >= 0 &&
            exponent < digits
        )
    )
  );

  const clearReplayTimer = () => {
    if (replayTimerRef.current) {
      window.clearTimeout(
        replayTimerRef.current
      );

      replayTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (replayTimerRef.current) {
        window.clearTimeout(
          replayTimerRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHistoricalMistakes() {
      setHistoricalMistakesLoading(true);
      setHistoricalMistakesError(null);

      try {
        const sessions =
          await listStudentArenaSessions({
            activityKeys: [
              "smart-coach",
              "adaptive-practice"
            ],
            limit: 20
          });

        if (cancelled) {
          return;
        }

        setHistoricalMistakeSessions(
          Array.isArray(sessions)
            ? sessions
            : []
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setHistoricalMistakesError(
          error?.response?.data?.message ||
          error?.message ||
          "Unable to load recent Arena mistakes."
        );
      } finally {
        if (!cancelled) {
          setHistoricalMistakesLoading(false);
        }
      }
    }

    loadHistoricalMistakes();

    return () => {
      cancelled = true;
    };
  }, [historicalMistakesReloadKey]);

  const prepareQuestion = (
    index,
    focusOverride =
      activeFocusExponent
  ) => {
    clearReplayTimer();

    const nextTarget =
      randomTarget(
        digits,
        Number.isInteger(
          focusOverride
        )
          ? focusOverride
          : null
      );

    setQuestionIndex(index);
    setTarget(nextTarget);
    setCurrentValue(0);
    setMoves([]);
    setChecks(0);
    setFeedback(null);
    setShowMoves(false);
    setShowCorrectAbacus(false);
    setMistakeReplay(null);
    setReplaying(false);
    setReplayStep(0);
    setPhase("running");

    startedAtRef.current = Date.now();

    window.requestAnimationFrame(() => {
      abacusRef.current?.reset();
      abacusRef.current?.clearHistory();
    });
  };

  const startSession = () => {
    sessionSaveStartedRef.current = false;
    setResults([]);
    setStats(emptyStats());
    setMistakeCounts({});
    setMistakePracticeQueue([]);
    setMistakePracticeActive(false);

    prepareQuestion(
      0,
      activeFocusExponent
    );
  };

  const handleMove = (move) => {
    if (
      phase !== "running" ||
      replaying
    ) {
      return;
    }

    setMoves((previous) => [
      ...previous,
      {
        ...move,
        step: previous.length + 1,
        elapsedMs:
          Date.now() -
          startedAtRef.current
      }
    ]);

    setCurrentValue(move.afterValue);
    setFeedback(null);
    setShowCorrectAbacus(false);
  };

  const getActualValue = () => {
    const value =
      abacusRef.current?.getValue();

    return Number.isFinite(value)
      ? value
      : currentValue;
  };

  const showHint = () => {
    if (replaying) {
      return;
    }

    const actualValue =
      getActualValue();

    setCurrentValue(actualValue);

    setFeedback({
      type: "hint",
      coach: coachForValue(
        target,
        actualValue,
        digits
      )
    });
  };

  const checkAnswer = () => {
    if (
      phase !== "running" ||
      replaying
    ) {
      return;
    }

    const actualValue =
      getActualValue();

    setCurrentValue(actualValue);

    const nextChecks = checks + 1;

    setChecks(nextChecks);

    if (!sameValue(actualValue, target)) {
      const coach = coachForValue(
        target,
        actualValue,
        digits
      );

      if (coach.mismatches.length) {
        setMistakeCounts(
          (previous) => {
            const next = {
              ...previous
            };

            coach.mismatches.forEach(
              (item) => {
                next[item.exponent] =
                  (
                    Number(
                      next[
                        item.exponent
                      ]
                    ) || 0
                  ) + 1;
              }
            );

            return next;
          }
        );
      }

      const replayMoves = moves.map(
        (move) => ({
          ...move,
          beforeState:
            move.beforeState?.map(
              (column) => ({
                ...column
              })
            ) || [],
          afterState:
            move.afterState?.map(
              (column) => ({
                ...column
              })
            ) || []
        })
      );

      setMistakeReplay({
        target,
        wrongValue: actualValue,
        moves: replayMoves,
        coach
      });

      setFeedback({
        type: "wrong",
        coach
      });

      return;
    }

    const elapsedMs = Math.max(
      0,
      Date.now() -
        startedAtRef.current
    );

    const result = {
      questionNumber:
        questionIndex + 1,
      target,
      moveCount: moves.length,
      elapsedMs,
      checks: nextChecks
    };

    setResults((previous) => [
      ...previous,
      result
    ]);

    setStats((previous) => ({
      solved:
        previous.solved + 1,

      firstCheckCorrect:
        previous.firstCheckCorrect +
        (nextChecks === 1 ? 1 : 0),

      totalMoves:
        previous.totalMoves +
        moves.length,

      totalTimeMs:
        previous.totalTimeMs +
        elapsedMs,

      wrongChecks:
        previous.wrongChecks +
        Math.max(
          0,
          nextChecks - 1
        )
    }));

    setFeedback({
      type: "correct",
      message:
        "Correct. Your bead value matches the target."
    });

    setPhase("solved");
  };

  const replayMistake = () => {
    if (
      replaying ||
      !mistakeReplay?.moves?.length
    ) {
      return;
    }

    clearReplayTimer();

    const snapshot = mistakeReplay;
    const replayMoves = snapshot.moves;

    setReplaying(true);
    setReplayStep(0);

    setFeedback({
      type: "replay",
      message:
        "Replaying your bead movements from the start of this attempt."
    });

    const initialValue =
      replayMoves[0]?.beforeValue ?? 0;

    abacusRef.current?.loadValue(
      initialValue
    );

    const playStep = (index) => {
      if (index >= replayMoves.length) {
        replayTimerRef.current = null;

        setReplayStep(
          replayMoves.length
        );

        setReplaying(false);

        setFeedback({
          type: "wrong",
          coach: snapshot.coach
        });

        return;
      }

      const move =
        replayMoves[index];

      abacusRef.current?.loadValue(
        move.afterValue
      );

      setReplayStep(index + 1);

      setFeedback({
        type: "replay",
        message:
          `Move ${index + 1} of ${replayMoves.length}: ` +
          `${move.placeLabel}, ` +
          `${move.beforeDigit} → ${move.afterDigit}.`
      });

      replayTimerRef.current =
        window.setTimeout(
          () => playStep(index + 1),
          700
        );
    };

    replayTimerRef.current =
      window.setTimeout(
        () => playStep(0),
        450
      );
  };

  const showMistakeReplayStep = (
    requestedStep
  ) => {
    if (!mistakeReplay?.moves?.length) {
      return;
    }

    clearReplayTimer();
    setReplaying(false);

    const replayMoves =
      mistakeReplay.moves;

    const nextStep = Math.min(
      replayMoves.length,
      Math.max(
        0,
        Number(requestedStep) || 0
      )
    );

    setReplayStep(nextStep);

    if (nextStep === 0) {
      abacusRef.current?.loadValue(
        replayMoves[0]?.beforeValue ?? 0
      );

      setFeedback({
        type: "replay",
        message:
          "Start of the recorded attempt."
      });

      return;
    }

    const move =
      replayMoves[nextStep - 1];

    abacusRef.current?.loadValue(
      move.afterValue
    );

    setFeedback({
      type: "replay",
      message:
        `Move ${nextStep} of ${replayMoves.length}: ` +
        `${move.placeLabel}, ` +
        `${move.beforeDigit} → ${move.afterDigit}.`
    });
  };

  const revealCorrectAbacus = () => {
    setShowCorrectAbacus(true);

    window.requestAnimationFrame(() => {
      correctAbacusRef.current?.loadValue(
        target
      );
      correctAbacusRef.current?.clearHistory();
    });
  };

  const resetAttempt = () => {
    clearReplayTimer();

    setReplaying(false);
    setReplayStep(0);
    setMistakeReplay(null);

    abacusRef.current?.reset();
    abacusRef.current?.clearHistory();

    setCurrentValue(0);
    setMoves([]);
    setChecks(0);
    setFeedback(null);
    setShowMoves(false);
    setShowCorrectAbacus(false);

    startedAtRef.current =
      Date.now();
  };

  const startMistakePracticeFromCounts = (
    sourceMistakeCounts
  ) => {
    sessionSaveStartedRef.current = false;

    const queue =
      buildMistakePracticeQueue(
        sourceMistakeCounts,
        digits
      );

    if (!queue.length) {
      return;
    }

    clearReplayTimer();

    setMistakePracticeQueue(queue);
    setMistakePracticeActive(true);

    setResults([]);
    setStats(emptyStats());
    setMistakeCounts({});

    setFeedback(null);
    setMistakeReplay(null);
    setReplaying(false);
    setReplayStep(0);

    prepareQuestion(
      0,
      queue[0]
    );
  };

  const startMistakePractice = () => {
    startMistakePracticeFromCounts(
      mistakeCounts
    );
  };

  const startHistoricalMistakePractice = () => {
    startMistakePracticeFromCounts(
      historicalMistakeCounts
    );
  };

  const nextQuestion = () => {
    const nextIndex =
      questionIndex + 1;

    if (
      nextIndex >=
      activeQuestionCount
    ) {
      setPhase("complete");
      return;
    }

    prepareQuestion(
      nextIndex,
      mistakePracticeActive
        ? mistakePracticeQueue[
            nextIndex
          ]
        : activeFocusExponent
    );
  };

  const resetToSetup = () => {
    sessionSaveStartedRef.current = false;
    clearReplayTimer();

    setReplaying(false);
    setReplayStep(0);
    setMistakeReplay(null);

    setPhase("setup");
    setQuestionIndex(0);
    setTarget(0);
    setCurrentValue(0);
    setMoves([]);
    setChecks(0);
    setFeedback(null);
    setShowMoves(false);
    setShowCorrectAbacus(false);
    setResults([]);
    setStats(emptyStats());
    setMistakeCounts({});
    setMistakePracticeQueue([]);
    setMistakePracticeActive(false);
  };

  const firstCheckAccuracy =
    stats.solved
      ? Math.round(
          (
            stats.firstCheckCorrect /
            stats.solved
          ) * 100
        )
      : 0;

  const averageMoves =
    stats.solved
      ? (
          stats.totalMoves /
          stats.solved
        ).toFixed(1)
      : "0.0";

  const averageTime =
    stats.solved
      ? (
          stats.totalTimeMs /
          stats.solved /
          1000
        ).toFixed(1)
      : "0.0";

  const rankedMistakeEntries =
    Object.entries(
      mistakeCounts || {}
    )
      .map(
        ([rawExponent, rawCount]) => ({
          exponent: Number(rawExponent),
          count: Number(rawCount) || 0
        })
      )
      .filter(
        (item) =>
          Number.isInteger(item.exponent) &&
          item.exponent >= 0 &&
          item.exponent < digits &&
          item.count > 0
      )
      .sort(
        (left, right) =>
          right.count - left.count ||
          left.exponent - right.exponent
      );

  const primaryWeakExponent =
    rankedMistakeEntries[0]?.exponent ??
    null;

  useEffect(() => {
    if (
      phase !== "complete" ||
      sessionSaveStartedRef.current ||
      stats.solved <= 0
    ) {
      return;
    }

    sessionSaveStartedRef.current = true;

    const activityKey =
      mistakePracticeActive
        ? "practice-mistakes"
        : adaptiveMode
          ? "adaptive-practice"
          : "smart-coach";

    const mode =
      mistakePracticeActive
        ? "mistake-practice"
        : effectiveTrainingMode === "focus"
          ? "adaptive"
          : "coach";

    void recordStudentArenaSession({
      activityKey,
      mode,
      attemptCount: stats.solved,
      correctCount: stats.firstCheckCorrect,
      durationMs: Math.min(
        86_400_000,
        Math.max(0, Number(stats.totalTimeMs) || 0)
      ),
      metrics: {
        digits,
        configuredQuestionCount: questionCount,
        completedQuestionCount: stats.solved,
        firstCheckAccuracy,
        totalMoves: stats.totalMoves,
        wrongChecks: stats.wrongChecks,
        mistakeCounts,
        adaptiveFocusExponent:
          Number.isInteger(activeFocusExponent)
            ? activeFocusExponent
            : null,
        source: "smart-coach"
      }
    }).catch((error) => {
      sessionSaveStartedRef.current = false;
      console.warn("smart_coach_session_save_failed", error);
    });
  }, [
    activeFocusExponent,
    adaptiveMode,
    effectiveTrainingMode,
    digits,
    firstCheckAccuracy,
    mistakeCounts,
    mistakePracticeActive,
    phase,
    questionCount,
    stats.firstCheckCorrect,
    stats.solved,
    stats.totalMoves,
    stats.totalTimeMs,
    stats.wrongChecks
  ]);

  if (phase === "setup") {
    const modeOptions = [
      {
        id: "guided",
        icon: "🤖",
        title: "Guided Practice",
        description:
          "Build the target and ask the coach for rod-by-rod help whenever you need it."
      },
      {
        id: "independent",
        icon: "🧠",
        title: "Independent Practice",
        description:
          "Solve first without seeing the current numeric value. Coaching unlocks after your first check."
      },
      {
        id: "fix",
        icon: "🔧",
        title: "Fix My Mistakes",
        description:
          "Use recent Smart Coach history to practise the rods that caused the most difficulty."
      },
      {
        id: "focus",
        icon: "🎯",
        title: "Focus Practice",
        description:
          "Choose a place value yourself or let Smart Coach automatically target the weakest rod."
      }
    ];

    const startSelectedMode = () => {
      if (effectiveTrainingMode === "fix") {
        startHistoricalMistakePractice();
        return;
      }

      startSession();
    };

    const selectedMode =
      modeOptions.find(
        (item) =>
          item.id === effectiveTrainingMode
      ) || modeOptions[0];

    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Smart Coach</h1>
            <div className="muted">
              Choose how you want to practise. The same coach, replay engine,
              mistake history and scoring stay together in one workspace.
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

        <div
          className="card"
          style={{ marginBottom: 16 }}
        >
          <h2>Choose Training Mode</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginTop: 14
            }}
          >
            {modeOptions.map((item) => {
              const selected =
                item.id ===
                effectiveTrainingMode;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    setTrainingMode(item.id)
                  }
                  aria-pressed={selected}
                  style={{
                    minHeight: 140,
                    padding: 16,
                    borderRadius: 16,
                    border: selected
                      ? "2px solid #7c3aed"
                      : "1px solid var(--border, #e5e7eb)",
                    background: selected
                      ? "rgba(124, 58, 237, 0.08)"
                      : "var(--card, transparent)",
                    color: "inherit",
                    textAlign: "left",
                    cursor: "pointer"
                  }}
                >
                  <div
                    style={{
                      fontSize: 26,
                      marginBottom: 8
                    }}
                  >
                    {item.icon}
                  </div>

                  <strong
                    style={{
                      display: "block",
                      fontSize: 16
                    }}
                  >
                    {item.title}
                  </strong>

                  <div
                    className="muted"
                    style={{
                      marginTop: 6,
                      lineHeight: 1.45
                    }}
                  >
                    {item.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2>{selectedMode.title}</h2>

          <div
            className="muted"
            style={{ marginTop: 6 }}
          >
            {selectedMode.description}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 16,
              marginTop: 18
            }}
          >
            <label>
              <strong>Digits</strong>

              <select
                className="input"
                value={digits}
                onChange={(event) =>
                  setDigits(
                    Number(event.target.value)
                  )
                }
                style={{ marginTop: 8 }}
              >
                {DIGIT_OPTIONS.map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value} digit
                      {value === 1 ? "" : "s"}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <strong>Challenges</strong>

              <select
                className="input"
                value={questionCount}
                onChange={(event) =>
                  setQuestionCount(
                    Number(event.target.value)
                  )
                }
                style={{ marginTop: 8 }}
              >
                {QUESTION_COUNTS.map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value} challenges
                    </option>
                  )
                )}
              </select>
            </label>

            {effectiveTrainingMode ===
            "focus" ? (
              <label>
                <strong>Focus</strong>

                <select
                  className="input"
                  value={focusSelection}
                  onChange={(event) =>
                    setFocusSelection(
                      event.target.value
                    )
                  }
                  style={{ marginTop: 8 }}
                >
                  <option value="auto">
                    Auto — Coach chooses
                  </option>

                  {Array.from(
                    { length: digits },
                    (_, exponent) => (
                      <option
                        key={exponent}
                        value={String(exponent)}
                      >
                        {placeLabel(exponent)}
                      </option>
                    )
                  )}
                </select>
              </label>
            ) : null}
          </div>

          {effectiveTrainingMode ===
          "fix" ? (
            <div
              style={{
                marginTop: 18,
                padding: 16,
                border:
                  "1px solid var(--border, #e5e7eb)",
                borderRadius: 12
              }}
            >
              <strong>Recent weak rods</strong>

              <div
                className="muted"
                style={{ marginTop: 6 }}
              >
                Uses your existing Smart Coach and Adaptive Practice history
                for the selected digit setting.
              </div>

              {historicalMistakesLoading ? (
                <div
                  className="muted"
                  style={{ marginTop: 10 }}
                >
                  Loading recent mistakes…
                </div>
              ) : historicalMistakesError ? (
                <div style={{ marginTop: 10 }}>
                  <div
                    className="muted"
                    role="alert"
                  >
                    {historicalMistakesError}
                  </div>

                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      setHistoricalMistakesReloadKey(
                        (current) =>
                          current + 1
                      )
                    }
                    style={{
                      width: "auto",
                      marginTop: 10
                    }}
                  >
                    Retry mistake history
                  </button>
                </div>
              ) : historicalMistakeQueue.length ? (
                <>
                  <div
                    style={{
                      display: "grid",
                      gap: 7,
                      marginTop: 12
                    }}
                  >
                    {Object.entries(
                      historicalMistakeCounts
                    )
                      .map(
                        ([
                          rawExponent,
                          rawCount
                        ]) => ({
                          exponent:
                            Number(
                              rawExponent
                            ),
                          count:
                            Number(rawCount) ||
                            0
                        })
                      )
                      .filter(
                        (item) =>
                          item.count > 0
                      )
                      .sort(
                        (left, right) =>
                          right.count -
                          left.count
                      )
                      .slice(0, 5)
                      .map((item) => (
                        <div
                          key={
                            item.exponent
                          }
                          style={{
                            display:
                              "flex",
                            justifyContent:
                              "space-between",
                            gap: 12,
                            padding:
                              "8px 10px",
                            borderRadius: 8,
                            background:
                              "rgba(124, 58, 237, 0.06)"
                          }}
                        >
                          <strong>
                            {placeLabel(
                              item.exponent
                            )}
                          </strong>
                          <span
                            className="muted"
                          >
                            {item.count} mistake
                            {item.count === 1
                              ? ""
                              : "s"}
                          </span>
                        </div>
                      ))}
                  </div>

                  <div
                    className="muted"
                    style={{ marginTop: 10 }}
                  >
                    {
                      historicalMistakeQueue.length
                    } corrective challenge
                    {historicalMistakeQueue.length ===
                    1
                      ? ""
                      : "s"}{" "}
                    ready.
                  </div>
                </>
              ) : (
                <div
                  className="muted"
                  style={{ marginTop: 10 }}
                >
                  No recent mistakes are recorded
                  for {digits}-digit practice yet.
                </div>
              )}
            </div>
          ) : null}

          {effectiveTrainingMode ===
          "independent" ? (
            <div
              className="muted"
              style={{ marginTop: 16 }}
            >
              Independent Practice hides the numeric Current value while you
              solve. After your first check, coaching and the numeric value are
              available.
            </div>
          ) : effectiveTrainingMode ===
            "focus" ? (
            <div
              className="muted"
              style={{ marginTop: 16 }}
            >
              {focusSelection === "auto"
                ? "Smart Coach will learn from wrong rods during this session and focus later challenges on the weakest place."
                : `Every challenge will actively include ${placeLabel(
                    Number(
                      focusSelection
                    )
                  )}.`}
            </div>
          ) : (
            <div
              className="muted"
              style={{ marginTop: 16 }}
            >
              Ask for Coach Hint at any time. Wrong rods are highlighted using
              the existing deterministic digit comparison.
            </div>
          )}

          <button
            className="button"
            type="button"
            onClick={startSelectedMode}
            disabled={
              effectiveTrainingMode ===
                "fix" &&
              (
                historicalMistakesLoading ||
                !historicalMistakeQueue.length
              )
            }
            style={{
              width: "auto",
              marginTop: 18
            }}
          >
            {effectiveTrainingMode ===
            "fix"
              ? historicalMistakeQueue.length
                ? `Start Fix My Mistakes (${historicalMistakeQueue.length})`
                : "No Mistakes to Practise"
              : effectiveTrainingMode ===
                "independent"
                ? "Start Independent Practice"
                : effectiveTrainingMode ===
                  "focus"
                  ? "Start Focus Practice"
                  : "Start Guided Practice"}
          </button>
        </div>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>
              {mistakePracticeActive
                ? "Fix My Mistakes Score Card"
                : "Smart Coach Score Card"}
            </h1>

            <div className="muted">
              {mistakePracticeActive
                ? "Focused corrective practice complete."
                : "Movement-based training session complete."}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginBottom: 16
          }}
        >
          <div className="card">
            <div className="muted">
              Solved
            </div>
            <h2>{stats.solved}</h2>
          </div>

          <div className="card">
            <div className="muted">
              First-check accuracy
            </div>

            <h2>
              {firstCheckAccuracy}%
            </h2>
          </div>

          <div className="card">
            <div className="muted">
              Avg. moves
            </div>

            <h2>
              {averageMoves}
            </h2>
          </div>

          <div className="card">
            <div className="muted">
              Avg. time
            </div>

            <h2>
              {averageTime}s
            </h2>
          </div>

          <div className="card">
            <div className="muted">
              Wrong checks
            </div>

            <h2>
              {stats.wrongChecks}
            </h2>
          </div>
        </div>

        {effectiveTrainingMode ===
        "focus" ? (
          <div
            className="card"
            style={{ marginBottom: 16 }}
          >
            <h2>Focus Summary</h2>

            <div className="muted">
              {Number.isInteger(
                activeFocusExponent
              )
                ? `Session focus: ${placeLabel(
                    activeFocusExponent
                  )}.`
                : "Auto Focus started broad because no persistent weak rod was available yet."}
            </div>
          </div>
        ) : null}

        <div
          className="card"
          style={{ marginBottom: 16 }}
        >
          <h2>Your Focus Areas</h2>

          {rankedMistakeEntries.length ? (
            <>
              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 12
                }}
              >
                {rankedMistakeEntries
                  .slice(0, 5)
                  .map((item, index) => (
                    <div
                      key={item.exponent}
                      style={{
                        display: "flex",
                        justifyContent:
                          "space-between",
                        alignItems: "center",
                        gap: 12,
                        padding: 10,
                        borderRadius: 8,
                        border:
                          "1px solid var(--border, #e5e7eb)"
                      }}
                    >
                      <div>
                        <strong>
                          {placeLabel(
                            item.exponent
                          )}
                        </strong>
                        <div
                          className="muted"
                          style={{
                            marginTop: 3
                          }}
                        >
                          {index === 0
                            ? "Needs the most practice"
                            : "Also needs attention"}
                        </div>
                      </div>

                      <strong>
                        {item.count} mistake
                        {item.count === 1
                          ? ""
                          : "s"}
                      </strong>
                    </div>
                  ))}
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: 14,
                  borderRadius: 10,
                  background:
                    "rgba(124, 58, 237, 0.08)"
                }}
              >
                <strong>
                  🤖 Coach Recommendation
                </strong>

                <div
                  className="muted"
                  style={{ marginTop: 5 }}
                >
                  Practise{" "}
                  {placeLabel(
                    primaryWeakExponent
                  )}{" "}
                  next. It caused the most
                  wrong checks in this session.
                </div>

                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setTrainingMode(
                      "focus"
                    );
                    setFocusSelection(
                      String(
                        primaryWeakExponent
                      )
                    );
                    resetToSetup();
                  }}
                  style={{
                    width: "auto",
                    marginTop: 10
                  }}
                >
                  Practice{" "}
                  {placeLabel(
                    primaryWeakExponent
                  )}
                </button>
              </div>
            </>
          ) : (
            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              No weak rod was detected from wrong
              checks in this session.
            </div>
          )}
        </div>

        <div
          className="card"
          style={{ marginBottom: 16 }}
        >
          <h2>
            Challenge Summary
          </h2>

          <div
            style={{
              display: "grid",
              gap: 8,
              marginTop: 12
            }}
          >
            {results.map((result) => (
              <div
                key={
                  result.questionNumber
                }
                style={{
                  padding: 10,
                  borderRadius: 8,
                  border:
                    "1px solid var(--border, #e5e7eb)"
                }}
              >
                <strong>
                  Challenge{" "}
                  {result.questionNumber}
                  {" · "}
                  Target{" "}
                  {formatValue(
                    result.target
                  )}
                </strong>

                <div
                  className="muted"
                  style={{ marginTop: 4 }}
                >
                  {result.moveCount} moves
                  {" · "}
                  {(
                    result.elapsedMs /
                    1000
                  ).toFixed(1)}
                  s
                  {" · "}
                  {result.checks === 1
                    ? "Correct first check"
                    : `${
                        result.checks - 1
                      } wrong check${
                        result.checks === 2
                          ? ""
                          : "s"
                      }`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          {buildMistakePracticeQueue(
            mistakeCounts,
            digits
          ).length > 0 ? (
            <button
              className="button"
              type="button"
              onClick={startMistakePractice}
            >
              {mistakePracticeActive
                ? "Fix My Mistakes Again"
                : `Fix My Mistakes (${buildMistakePracticeQueue(
                    mistakeCounts,
                    digits
                  ).length})`}
            </button>
          ) : null}

          <button
            className={
              buildMistakePracticeQueue(
                mistakeCounts,
                digits
              ).length > 0
                ? "button secondary"
                : "button"
            }
            type="button"
            onClick={startSession}
          >
            Retry Session
          </button>

          <button
            className="button secondary"
            type="button"
            onClick={resetToSetup}
          >
            Change Settings
          </button>

          <Link
            className="button secondary"
            to="/student/virtual-abacus/arena"
          >
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  const coach =
    feedback?.coach || null;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>{pageTitle}</h1>

          <div className="muted">
            Challenge{" "}
            {questionIndex + 1} of{" "}
            {activeQuestionCount}

            {" · "}
            {mistakePracticeActive
              ? "Fix My Mistakes"
              : effectiveTrainingMode ===
                "independent"
                ? "Independent"
                : effectiveTrainingMode ===
                  "focus"
                  ? Number.isInteger(
                      activeFocusExponent
                    )
                    ? `Focus ${placeLabel(
                        activeFocusExponent
                      )}`
                    : "Auto Focus"
                  : "Guided"}

            {mistakePracticeActive &&
            Number.isInteger(
              mistakePracticeQueue[
                questionIndex
              ]
            )
              ? ` · ${placeLabel(
                  mistakePracticeQueue[
                    questionIndex
                  ]
                )}`
              : ""}
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
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 10,
          marginBottom: 16
        }}
      >
        <div
          className="card"
          style={{ textAlign: "center" }}
        >
          <div className="muted">
            Target
          </div>

          <h2>
            {formatValue(target)}
          </h2>
        </div>

        <div
          className="card"
          style={{ textAlign: "center" }}
        >
          <div className="muted">
            Current
          </div>

          <h2>
            {effectiveTrainingMode ===
              "independent" &&
            checks === 0 &&
            !feedback
              ? "Hidden"
              : formatValue(currentValue)}
          </h2>
        </div>

        <div
          className="card"
          style={{ textAlign: "center" }}
        >
          <div className="muted">
            Moves
          </div>

          <h2>{moves.length}</h2>
        </div>

        <div
          className="card"
          style={{ textAlign: "center" }}
        >
          <div className="muted">
            Checks
          </div>

          <h2>{checks}</h2>
        </div>

        {effectiveTrainingMode ===
        "focus" ? (
          <div
            className="card"
            style={{
              textAlign: "center"
            }}
          >
            <div className="muted">
              Focus
            </div>

            <h2>
              {activeFocusExponent ===
              null
                ? "Learning"
                : placeLabel(
                    activeFocusExponent
                  )}
            </h2>
          </div>
        ) : null}
      </div>

      <div
        className="card"
        style={{ marginBottom: 16 }}
      >
        <div
          className="muted"
          style={{
            textAlign: "center",
            marginBottom: 12
          }}
        >
          Build the target number
        </div>

        <VirtualAbacus
          ref={abacusRef}
          columns={13}
          fractionalRods={6}
          markerExponents={
            STANDARD_PLACE_MARKERS
          }
          highlightExponents={
            highlightedCoachExponents
          }
          showValue={
            effectiveTrainingMode !==
              "independent" ||
            checks > 0 ||
            Boolean(feedback)
          }
          showLabels
          showReset={false}
          interactive={
            phase === "running" &&
            !replaying
          }
          onValueChange={(value) =>
            setCurrentValue(value)
          }
          onMove={handleMove}
        />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 8,
            marginTop: 16
          }}
        >
          {phase === "running" ? (
            <>
              <button
                className="button"
                type="button"
                onClick={checkAnswer}
                disabled={replaying}
                style={{ width: "auto" }}
              >
                Check Answer
              </button>

              {effectiveTrainingMode !==
                "independent" ||
              checks > 0 ||
              Boolean(feedback) ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={showHint}
                  disabled={replaying}
                  style={{ width: "auto" }}
                >
                  Coach Hint
                </button>
              ) : null}

              <button
                className="button secondary"
                type="button"
                onClick={resetAttempt}
                disabled={replaying}
                style={{ width: "auto" }}
              >
                Reset Attempt
              </button>

              {mistakeReplay?.moves?.length ? (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      showMistakeReplayStep(
                        replayStep - 1
                      )
                    }
                    disabled={
                      replaying ||
                      replayStep <= 0
                    }
                    style={{ width: "auto" }}
                  >
                    ◀ Previous Move
                  </button>

                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      showMistakeReplayStep(
                        replayStep + 1
                      )
                    }
                    disabled={
                      replaying ||
                      replayStep >=
                        mistakeReplay.moves
                          .length
                    }
                    style={{ width: "auto" }}
                  >
                    Next Move ▶
                  </button>

                  <button
                    className="button secondary"
                    type="button"
                    onClick={replayMistake}
                    disabled={replaying}
                    style={{ width: "auto" }}
                  >
                    {replaying
                      ? `Replaying ${replayStep}/${mistakeReplay.moves.length}`
                      : "▶ Auto Replay"}
                  </button>
                </>
              ) : null}

              {coach &&
              feedback?.type !==
                "correct" ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={
                    revealCorrectAbacus
                  }
                  disabled={replaying}
                  style={{ width: "auto" }}
                >
                  Show Correct Abacus
                </button>
              ) : null}
            </>
          ) : (
            <button
              className="button"
              type="button"
              onClick={nextQuestion}
              style={{ width: "auto" }}
            >
              {questionIndex + 1 >=
              activeQuestionCount
                ? "View Results"
                : "Next Challenge"}
            </button>
          )}

          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setShowMoves(
                (value) => !value
              )
            }
            style={{ width: "auto" }}
          >
            {showMoves
              ? "Hide Moves"
              : "Show Moves"}
          </button>
        </div>
      </div>

      {feedback ? (
        <div
          className="card"
          style={{ marginBottom: 16 }}
          aria-live="polite"
        >
          {feedback.type ===
          "correct" ? (
            <>
              <h2>Nice work</h2>

              <div className="muted">
                {feedback.message}
              </div>
            </>
          ) : feedback.type === "replay" ? (
            <>
              <h2>Mistake Replay</h2>

              <div className="muted">
                {feedback.message}
              </div>

              <div
                className="muted"
                style={{ marginTop: 8 }}
              >
                Step {replayStep} of{" "}
                {mistakeReplay?.moves?.length || 0}
              </div>
            </>
          ) : coach ? (
            <>
              <h2>
                {feedback.type ===
                "hint"
                  ? "Coach Hint"
                  : "Let's Fix It"}
              </h2>

              <div
                style={{
                  fontWeight: 700,
                  marginTop: 8
                }}
              >
                {coach.summary}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                  marginTop: 12
                }}
              >
                {coach.mismatches
                  .slice(0, 3)
                  .map((item) => (
                    <div
                      key={
                        item.exponent
                      }
                      style={{
                        padding: 10,
                        borderRadius: 8,
                        border:
                          "1px solid var(--border, #e5e7eb)"
                      }}
                    >
                      <strong>
                        Focus on{" "}
                        {placeLabel(
                          item.exponent
                        )}
                      </strong>

                      <div
                        className="muted"
                        style={{
                          marginTop: 4
                        }}
                      >
                        Current digit:{" "}
                        {item.currentDigit}
                        {" → "}
                        Target digit:{" "}
                        {item.targetDigit}
                        {" · "}
                        Adjust this rod
                        by{" "}
                        {item.adjustment >
                        0
                          ? "+"
                          : ""}
                        {
                          item.adjustment
                        }
                      </div>
                    </div>
                  ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}

      {showCorrectAbacus ? (
        <div
          className="card"
          style={{ marginBottom: 16 }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginBottom: 12
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>
                Correct Abacus
              </h2>
              <div
                className="muted"
                style={{ marginTop: 4 }}
              >
                Compare your board with the correct
                bead value for{" "}
                {formatValue(target)}.
              </div>
            </div>

            <button
              className="button secondary"
              type="button"
              onClick={() =>
                setShowCorrectAbacus(false)
              }
              style={{ width: "auto" }}
            >
              Hide
            </button>
          </div>

          <VirtualAbacus
            ref={correctAbacusRef}
            columns={13}
            fractionalRods={6}
            markerExponents={
              STANDARD_PLACE_MARKERS
            }
            showValue
            showLabels
            showReset={false}
            interactive={false}
          />
        </div>
      ) : null}

      {showMoves ? (
        <div className="card">
          <h2>
            Movement History
          </h2>

          {!moves.length ? (
            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              Move a bead to start
              recording.
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gap: 8,
                marginTop: 12
              }}
            >
              {moves.map((move) => (
                <div
                  key={`${move.step}-${move.occurredAt}`}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border:
                      "1px solid var(--border, #e5e7eb)"
                  }}
                >
                  <strong>
                    Move {move.step}
                    {" · "}
                    {move.placeLabel}
                  </strong>

                  <div
                    className="muted"
                    style={{ marginTop: 4 }}
                  >
                    {move.type ===
                    "upper"
                      ? "Upper bead"
                      : "Lower beads"}
                    {" · "}
                    Digit{" "}
                    {move.beforeDigit}
                    {" → "}
                    {move.afterDigit}
                    {" · "}
                    Value{" "}
                    {formatValue(
                      move.beforeValue
                    )}
                    {" → "}
                    {formatValue(
                      move.afterValue
                    )}
                    {" · "}
                    {(
                      move.elapsedMs /
                      1000
                    ).toFixed(1)}
                    s
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export {
  StudentAbacusSmartCoachPage
};
