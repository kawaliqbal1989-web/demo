import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link } from "react-router-dom";
import { recordStudentArenaSession } from "../../services/studentArenaService";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import {
  ArenaMobileHandoff,
  getArenaQueryNumber,
  getArenaQueryValue
} from "../../components/ArenaMobileHandoff";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];

const MODES = [
  {
    id: "build",
    title: "Build Number",
    description:
      "Build each target on the Virtual Abacus as quickly and accurately as possible."
  },
  {
    id: "read",
    title: "Read Abacus",
    description:
      "Read each bead pattern and enter its value before the timer ends."
  }
];

const DURATIONS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "60 seconds" },
  { value: 120, label: "2 minutes" }
];

const DIFFICULTIES = {
  beginner: {
    label: "Beginner",
    integerMax: 999,
    decimals: 0,
    showValue: true,
    showLabels: true
  },
  normal: {
    label: "Normal",
    integerMax: 99999,
    decimals: 1,
    showValue: false,
    showLabels: true
  },
  challenge: {
    label: "Challenge",
    integerMax: 9999999,
    decimals: 3,
    showValue: false,
    showLabels: false
  }
};

function randomValueForDifficulty(difficulty) {
  const config =
    DIFFICULTIES[difficulty] ||
    DIFFICULTIES.beginner;

  const scale = 10 ** config.decimals;

  const maxScaled =
    config.integerMax * scale +
    (scale - 1);

  const scaled = Math.max(
    1,
    Math.floor(
      Math.random() *
        (maxScaled + 1)
    )
  );

  return scaled / scale;
}

function sameAbacusValue(left, right) {
  return (
    Math.round(Number(left || 0) * 1_000_000) ===
    Math.round(Number(right || 0) * 1_000_000)
  );
}

function formatValue(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(Number(value || 0));
}

function parseNumericAnswer(value) {
  const parsed = Number(
    String(value || "")
      .replace(/,/g, "")
      .trim()
  );

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function createStats() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    totalMs: 0,
    bestMs: null,
    currentStreak: 0,
    bestStreak: 0
  };
}

function StudentAbacusSpeedChallengePage() {
  const abacusRef = useRef(null);
  const challengeStartedAtRef =
    useRef(Date.now());
  const nextChallengeTimerRef =
    useRef(null);
  const phaseRef = useRef("setup");
  const sessionSaveStartedRef = useRef(false);
  const mobileQuery = useMemo(
    () => new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    ),
    []
  );

  const [mode, setMode] = useState(() =>
    getArenaQueryValue(
      mobileQuery,
      "mode",
      MODES.map((item) => item.id),
      "build"
    )
  );

  const [difficulty, setDifficulty] = useState(() =>
    getArenaQueryValue(
      mobileQuery,
      "difficulty",
      Object.keys(DIFFICULTIES),
      "beginner"
    )
  );

  const [duration, setDuration] = useState(() =>
    getArenaQueryNumber(
      mobileQuery,
      "duration",
      DURATIONS.map((item) => item.value),
      60
    )
  );

  const [secondsLeft, setSecondsLeft] =
    useState(60);

  const [phase, setPhase] =
    useState("setup");

  const [paused, setPaused] =
    useState(false);

  const [locked, setLocked] =
    useState(false);

  const [targetValue, setTargetValue] =
    useState(0);

  const [currentValue, setCurrentValue] =
    useState(0);

  const [readAnswer, setReadAnswer] =
    useState("");

  const [feedback, setFeedback] =
    useState(null);

  const [stats, setStats] =
    useState(createStats);

  const config =
    DIFFICULTIES[difficulty] ||
    DIFFICULTIES.beginner;

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const clearPendingChallenge = () => {
    if (nextChallengeTimerRef.current) {
      window.clearTimeout(
        nextChallengeTimerRef.current
      );

      nextChallengeTimerRef.current =
        null;
    }
  };

  const prepareChallenge = () => {
    if (phaseRef.current !== "running") {
      return;
    }

    const nextTarget =
      randomValueForDifficulty(
        difficulty
      );

    setTargetValue(nextTarget);
    setCurrentValue(0);
    setReadAnswer("");
    setFeedback(null);
    setLocked(false);

    challengeStartedAtRef.current =
      Date.now();

    window.requestAnimationFrame(() => {
      if (mode === "read") {
        abacusRef.current?.loadValue(
          nextTarget
        );
      } else {
        abacusRef.current?.loadValue(0);
      }
    });
  };

  const startSession = () => {
    clearPendingChallenge();

    sessionSaveStartedRef.current = false;
    setStats(createStats());
    setSecondsLeft(duration);
    setPaused(false);
    setFeedback(null);
    setLocked(false);

    phaseRef.current = "running";
    setPhase("running");

    window.setTimeout(() => {
      prepareChallenge();
    }, 0);
  };

  useEffect(() => {
    if (
      phase !== "running" ||
      paused
    ) {
      return undefined;
    }

    const timer =
      window.setInterval(() => {
        setSecondsLeft((seconds) => {
          if (seconds <= 1) {
            window.clearInterval(timer);

            clearPendingChallenge();

            phaseRef.current =
              "complete";

            setPhase("complete");
            setPaused(false);
            setLocked(true);

            return 0;
          }

          return seconds - 1;
        });
      }, 1000);

    return () =>
      window.clearInterval(timer);
  }, [paused, phase]);

  useEffect(() => {
    return () => {
      clearPendingChallenge();
    };
  }, []);

  const recordAttempt = (correct) => {
    const elapsedMs = Math.max(
      0,
      Date.now() -
        challengeStartedAtRef.current
    );

    setStats((previous) => {
      const nextStreak = correct
        ? previous.currentStreak + 1
        : 0;

      return {
        attempts:
          previous.attempts + 1,

        correct:
          previous.correct +
          (correct ? 1 : 0),

        wrong:
          previous.wrong +
          (correct ? 0 : 1),

        totalMs:
          previous.totalMs +
          elapsedMs,

        bestMs: correct
          ? previous.bestMs === null
            ? elapsedMs
            : Math.min(
                previous.bestMs,
                elapsedMs
              )
          : previous.bestMs,

        currentStreak: nextStreak,

        bestStreak: Math.max(
          previous.bestStreak,
          nextStreak
        )
      };
    });
  };

  const submitAnswer = () => {
    if (
      phase !== "running" ||
      paused ||
      locked
    ) {
      return;
    }

    let submittedValue = null;

    if (mode === "build") {
      submittedValue = currentValue;
    } else {
      submittedValue =
        parseNumericAnswer(readAnswer);

      if (submittedValue === null) {
        setFeedback({
          type: "info",
          message:
            "Enter a valid number."
        });

        return;
      }
    }

    const correct = sameAbacusValue(
      submittedValue,
      targetValue
    );

    setLocked(true);
    recordAttempt(correct);

    setFeedback(
      correct
        ? {
            type: "success",
            message: "Correct!"
          }
        : {
            type: "error",
            message: `Correct value: ${formatValue(
              targetValue
            )}`
          }
    );

    clearPendingChallenge();

    nextChallengeTimerRef.current =
      window.setTimeout(
        () => {
          if (
            phaseRef.current ===
            "running"
          ) {
            prepareChallenge();
          }
        },
        correct ? 180 : 450
      );
  };

  useEffect(() => {
    const handleArenaEnter = (event) => {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        phase !== "running" ||
        paused ||
        locked ||
        mode !== "build"
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("button, a, input, textarea, select")
      ) {
        return;
      }

      event.preventDefault();
      submitAnswer();
    };

    window.addEventListener("keydown", handleArenaEnter);
    return () => window.removeEventListener("keydown", handleArenaEnter);
  }, [
    phase,
    paused,
    locked,
    mode,
    currentValue,
    targetValue
  ]);

  const togglePause = () => {
    if (phase !== "running") {
      return;
    }

    setPaused((value) => !value);
  };

  const endSession = () => {
    clearPendingChallenge();

    phaseRef.current = "complete";
    setPhase("complete");
    setPaused(false);
    setLocked(true);
  };

  const resetToSetup = () => {
    clearPendingChallenge();

    sessionSaveStartedRef.current = false;
    phaseRef.current = "setup";

    setPhase("setup");
    setPaused(false);
    setLocked(false);
    setSecondsLeft(duration);
    setTargetValue(0);
    setCurrentValue(0);
    setReadAnswer("");
    setFeedback(null);
    setStats(createStats());
  };

  const accuracy = stats.attempts
    ? Math.round(
        (stats.correct /
          stats.attempts) *
          100
      )
    : 0;

  const elapsedSeconds =
    Math.max(
      0,
      duration - secondsLeft
    );

  const questionsPerMinute =
    elapsedSeconds > 0
      ? (
          stats.attempts /
          (elapsedSeconds / 60)
        ).toFixed(1)
      : "0.0";

  const averageMs = stats.attempts
    ? Math.round(
        stats.totalMs /
          stats.attempts
      )
    : 0;

  useEffect(() => {
    if (
      phase !== "complete" ||
      sessionSaveStartedRef.current ||
      stats.attempts < 1
    ) {
      return;
    }

    sessionSaveStartedRef.current = true;

    const completedDurationMs = Math.min(
      86_400_000,
      Math.max(0, elapsedSeconds * 1000)
    );

    void recordStudentArenaSession({
      activityKey: "speed",
      mode,
      attemptCount: stats.attempts,
      correctCount: stats.correct,
      durationMs: completedDurationMs,
      metrics: {
        difficulty,
        configuredDurationSeconds: duration,
        elapsedSeconds,
        wrongCount: stats.wrong,
        bestStreak: stats.bestStreak,
        bestResponseMs: stats.bestMs,
        averageResponseMs: averageMs,
        questionsPerMinute: Number(questionsPerMinute)
      }
    }).catch((error) => {
      console.warn("speed_session_save_failed", error);
    });
  }, [
    averageMs,
    difficulty,
    duration,
    elapsedSeconds,
    mode,
    phase,
    questionsPerMinute,
    stats.attempts,
    stats.bestMs,
    stats.bestStreak,
    stats.correct,
    stats.wrong
  ]);

  const timerMinutes = String(
    Math.floor(secondsLeft / 60)
  ).padStart(2, "0");

  const timerSeconds = String(
    secondsLeft % 60
  ).padStart(2, "0");

  const progress = Math.min(
    100,
    Math.round(
      ((duration - secondsLeft) /
        duration) *
        100
    )
  );

  const resultCards = useMemo(
    () => [
      {
        label: "Questions",
        value: stats.attempts
      },
      {
        label: "Correct",
        value: stats.correct
      },
      {
        label: "Wrong",
        value: stats.wrong
      },
      {
        label: "Accuracy",
        value: `${accuracy}%`
      },
      {
        label: "Questions / min",
        value: questionsPerMinute
      },
      {
        label: "Best streak",
        value: stats.bestStreak
      },
      {
        label: "Best time",
        value:
          stats.bestMs === null
            ? "—"
            : `${(
                stats.bestMs / 1000
              ).toFixed(1)}s`
      },
      {
        label: "Average",
        value: stats.attempts
          ? `${(
              averageMs / 1000
            ).toFixed(1)}s`
          : "—"
      }
    ],
    [
      accuracy,
      averageMs,
      questionsPerMinute,
      stats
    ]
  );

  const speedSessionMessage =
    stats.attempts === 0
      ? "No answers were recorded. Try another short round when you are ready."
      : accuracy >= 90
        ? "Excellent speed with strong accuracy. Keep the rhythm going."
        : accuracy >= 70
          ? "Good pace. Another round can help you answer faster while staying accurate."
          : "Slow down just enough to improve accuracy, then try the same challenge again.";

  if (phase === "setup") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>
              Speed Challenge
            </h1>

            <div className="muted">
              Race against the clock
              while keeping your
              accuracy high.
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
          style={{
            marginBottom: 16
          }}
        >
          <h2>
            Challenge Mode
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
              marginTop: 14
            }}
          >
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`button secondary ${
                  mode === item.id
                    ? "va-is-active"
                    : ""
                }`}
                onClick={() =>
                  setMode(item.id)
                }
                style={{
                  textAlign: "left",
                  whiteSpace: "normal",
                  minHeight: 120
                }}
              >
                <strong>
                  {item.title}
                </strong>

                <div
                  className="muted"
                  style={{
                    marginTop: 7,
                    fontWeight: 400
                  }}
                >
                  {item.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>
            Challenge Settings
          </h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 16,
              marginTop: 16
            }}
          >
            <label>
              <strong>
                Difficulty
              </strong>

              <select
                className="input"
                value={difficulty}
                onChange={(event) =>
                  setDifficulty(
                    event.target.value
                  )
                }
                style={{ marginTop: 8 }}
              >
                {Object.entries(
                  DIFFICULTIES
                ).map(
                  ([key, value]) => (
                    <option
                      key={key}
                      value={key}
                    >
                      {value.label}
                    </option>
                  )
                )}
              </select>
            </label>

            <label>
              <strong>
                Time
              </strong>

              <select
                className="input"
                value={duration}
                onChange={(event) => {
                  const nextDuration =
                    Number(
                      event.target.value
                    );

                  setDuration(
                    nextDuration
                  );

                  setSecondsLeft(
                    nextDuration
                  );
                }}
                style={{ marginTop: 8 }}
              >
                {DURATIONS.map(
                  (item) => (
                    <option
                      key={item.value}
                      value={item.value}
                    >
                      {item.label}
                    </option>
                  )
                )}
              </select>
            </label>
          </div>

          <div
            className="muted"
            style={{ marginTop: 16 }}
          >
            Accuracy matters before
            speed. Wrong answers count
            against the final score.
          </div>

          <button
            className="button"
            type="button"
            onClick={startSession}
            style={{
              width: "auto",
              marginTop: 18
            }}
          >
            Start Speed Challenge
          </button>

          <ArenaMobileHandoff
            title="Speed Challenge"
            path="/student/virtual-abacus/arena/speed"
            params={{
              mode,
              difficulty,
              duration
            }}
          />
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
              Speed Challenge Results
            </h1>

            <div className="muted">
              {config.label} ·{" "}
              {mode === "build"
                ? "Build Number"
                : "Read Abacus"}
              {" · "}
              Session complete
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
              "linear-gradient(135deg, #ea580c 0%, #db2777 48%, #7c3aed 100%)",
            boxShadow: "0 18px 38px rgba(234, 88, 12, 0.18)"
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
                SPEED SESSION COMPLETE
              </div>

              <h2
                style={{
                  color: "#ffffff",
                  fontSize: 30,
                  margin: "7px 0 6px"
                }}
              >
                {questionsPerMinute} questions/min
              </h2>

              <div
                style={{
                  maxWidth: 620,
                  lineHeight: 1.55,
                  opacity: 0.88
                }}
              >
                {speedSessionMessage}
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
                  Accuracy
                </div>
                <strong style={{ fontSize: 21 }}>
                  {accuracy}%
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
                  Best streak
                </div>
                <strong style={{ fontSize: 21 }}>
                  {stats.bestStreak}
                </strong>
              </div>
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
          {resultCards.map(
            (item) => (
              <div
                className="card"
                key={item.label}
              >
                <div className="muted">
                  {item.label}
                </div>

                <h2>
                  {item.value}
                </h2>
              </div>
            )
          )}
        </div>

        <div
          className="card"
          style={{
            marginBottom: 16
          }}
        >
          <strong>
            Challenge Summary
          </strong>

          <div
            className="muted"
            style={{ marginTop: 6 }}
          >
            You attempted{" "}
            {stats.attempts} questions
            with {accuracy}% accuracy
            and averaged{" "}
            {questionsPerMinute} questions
            per minute.
          </div>
        </div>

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
              Race the same settings again, switch to mental training, or change your Anzan mode.
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
              ⏱ Play Again
            </button>

            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena/mental"
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              🧠 Mental Abacus
            </Link>

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
              ⚡ Flash Anzan
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
              🔊 Audio Anzan
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
          <h1>
            Speed Challenge
          </h1>

          <div className="muted">
            {mode === "build"
              ? "Build Number"
              : "Read Abacus"}
            {" · "}
            {config.label}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8
          }}
        >
          <button
            className="button secondary"
            type="button"
            onClick={togglePause}
            style={{ width: "auto" }}
          >
            {paused
              ? "Resume"
              : "Pause"}
          </button>

          <button
            className="button secondary"
            type="button"
            onClick={endSession}
            style={{ width: "auto" }}
          >
            End
          </button>
        </div>
      </div>

      <div
        aria-hidden="true"
        style={{
          height: 8,
          borderRadius: 999,
          overflow: "hidden",
          background:
            "var(--border, #e5e7eb)",
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

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 10,
          marginBottom: 16
        }}
      >
        <div
          className="card"
          style={{
            textAlign: "center"
          }}
        >
          <div className="muted">
            Time
          </div>

          <div
            style={{
              fontSize: "2.2rem",
              fontWeight: 800
            }}
          >
            {timerMinutes}:
            {timerSeconds}
          </div>
        </div>

        <div
          className="card"
          style={{
            textAlign: "center"
          }}
        >
          <div className="muted">
            Correct
          </div>

          <h2>
            {stats.correct}
          </h2>
        </div>

        <div
          className="card"
          style={{
            textAlign: "center"
          }}
        >
          <div className="muted">
            Accuracy
          </div>

          <h2>
            {accuracy}%
          </h2>
        </div>

        <div
          className="card"
          style={{
            textAlign: "center"
          }}
        >
          <div className="muted">
            Streak
          </div>

          <h2>
            {stats.currentStreak}
          </h2>
        </div>
      </div>

      <div
        className="card"
        style={{
          textAlign: "center",
          position: "relative"
        }}
      >
        {paused ? (
          <div
            style={{
              padding: "60px 20px"
            }}
          >
            <div
              style={{
                fontSize: "2rem",
                fontWeight: 800
              }}
            >
              Paused
            </div>

            <div
              className="muted"
              style={{ marginTop: 8 }}
            >
              Resume when you are ready.
            </div>
          </div>
        ) : (
          <>
            {mode === "build" ? (
              <>
                <div className="muted">
                  Build this number
                </div>

                <div
                  style={{
                    fontSize:
                      "clamp(2.4rem, 8vw, 5rem)",
                    fontWeight: 800,
                    margin: "14px 0"
                  }}
                >
                  {formatValue(
                    targetValue
                  )}
                </div>

                <VirtualAbacus
                  ref={abacusRef}
                  columns={13}
                  fractionalRods={6}
                  markerExponents={
                    STANDARD_PLACE_MARKERS
                  }
                  showValue={
                    config.showValue
                  }
                  showLabels={
                    config.showLabels
                  }
                  showReset={false}
                  interactive={!locked}
                  onValueChange={(value) =>
                    setCurrentValue(value)
                  }
                />

                <button
                  className="button"
                  type="button"
                  disabled={locked}
                  onClick={submitAnswer}
                  style={{
                    width: "auto",
                    marginTop: 16
                  }}
                >
                  Check
                </button>
              </>
            ) : (
              <>
                <div
                  className="muted"
                  style={{
                    marginBottom: 12
                  }}
                >
                  Read the abacus
                </div>

                <VirtualAbacus
                  ref={abacusRef}
                  columns={13}
                  fractionalRods={6}
                  markerExponents={
                    STANDARD_PLACE_MARKERS
                  }
                  showValue={false}
                  showLabels={
                    config.showLabels
                  }
                  showReset={false}
                  interactive={false}
                />

                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submitAnswer();
                  }}
                  style={{
                    marginTop: 18
                  }}
                >
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    disabled={locked}
                    value={readAnswer}
                    onChange={(event) =>
                      setReadAnswer(
                        event.target.value
                      )
                    }
                    placeholder="Enter value"
                    style={{
                      maxWidth: 360,
                      margin: "0 auto",
                      textAlign: "center",
                      fontSize: "2rem"
                    }}
                  />

                  <div
                    style={{
                      marginTop: 14
                    }}
                  >
                    <button
                      className="button"
                      type="submit"
                      disabled={locked}
                      style={{
                        width: "auto"
                      }}
                    >
                      Check
                    </button>
                  </div>
                </form>
              </>
            )}

            {feedback ? (
              <div
                aria-live="polite"
                style={{
                  marginTop: 12,
                  fontWeight: 700
                }}
              >
                {feedback.message}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export { StudentAbacusSpeedChallengePage };
