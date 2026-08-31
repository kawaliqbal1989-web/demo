import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VirtualAbacus } from "../../components/VirtualAbacus";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];
const PLACE_GUIDE = [
  { rod: 1, label: "Millions", exponent: 6 },
  { rod: 2, label: "Hundred Thousands", exponent: 5 },
  { rod: 3, label: "Ten Thousands", exponent: 4 },
  { rod: 4, label: "Thousands", exponent: 3 },
  { rod: 5, label: "Hundreds", exponent: 2 },
  { rod: 6, label: "Tens", exponent: 1 },
  { rod: 7, label: "Units", exponent: 0 },
  { rod: 8, label: "Tenths", exponent: -1 },
  { rod: 9, label: "Hundredths", exponent: -2 },
  { rod: 10, label: "Thousandths", exponent: -3 },
  { rod: 11, label: "Ten Thousandths", exponent: -4 },
  { rod: 12, label: "Hundred Thousandths", exponent: -5 },
  { rod: 13, label: "Millionths", exponent: -6 }
];

const DIFFICULTY_CONFIG = {
  beginner: { integerMax: 999, decimals: 0, label: "Beginner" },
  normal: { integerMax: 99999, decimals: 1, label: "Normal" },
  challenge: { integerMax: 9999999, decimals: 3, label: "Challenge" }
};

function randomValueForDifficulty(difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.beginner;
  const scale = Math.pow(10, config.decimals);
  const maxScaled = config.integerMax * scale + (scale - 1);
  const scaled = Math.max(1, Math.floor(Math.random() * (maxScaled + 1)));
  return scaled / scale;
}

function sameAbacusValue(a, b) {
  return Math.round(Number(a || 0) * 1_000_000) === Math.round(Number(b || 0) * 1_000_000);
}

function formatValue(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6
  }).format(Number(value || 0));
}

function decomposeValue(value) {
  const scale = 1_000_000;
  const scaled = Math.round(Math.max(0, Number(value) || 0) * scale);

  return PLACE_GUIDE.map((item) => {
    const scaledExponent = item.exponent + 6;
    const place = Math.pow(10, scaledExponent);
    const digit = Math.floor(scaled / place) % 10;
    return {
      ...item,
      digit,
      contribution: digit * Math.pow(10, item.exponent)
    };
  }).filter((item) => item.digit > 0);
}

function createStats() {
  return {
    attempts: 0,
    correct: 0,
    wrong: 0,
    totalMs: 0,
    bestMs: null
  };
}

function StudentVirtualAbacusLearning() {
  const abacusRef = useRef(null);
  const pageRef = useRef(null);
  const challengeStartedAtRef = useRef(Date.now());

  const [difficulty, setDifficulty] = useState("beginner");
  const [exercise, setExercise] = useState("make");
  const [showValue, setShowValue] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentValue, setCurrentValue] = useState(0);
  const [targetValue, setTargetValue] = useState(() => randomValueForDifficulty("beginner"));
  const [readAnswer, setReadAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [selectedRod, setSelectedRod] = useState(null);
  const [stats, setStats] = useState(createStats);
  const [challengeId, setChallengeId] = useState(1);
  const [answeredChallengeId, setAnsweredChallengeId] = useState(null);
  const [speedActive, setSpeedActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(120);

  const playFeedbackTone = useCallback((correct) => {
    if (!soundEnabled || typeof window === "undefined") return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = correct ? 660 : 220;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.09);
    oscillator.addEventListener("ended", () => context.close().catch(() => {}), { once: true });
  }, [soundEnabled]);

  const configureDifficulty = useCallback((nextDifficulty) => {
    setDifficulty(nextDifficulty);
    if (nextDifficulty === "beginner") {
      setShowValue(true);
      setShowLabels(true);
    } else if (nextDifficulty === "normal") {
      setShowValue(false);
      setShowLabels(true);
    } else {
      setShowValue(false);
      setShowLabels(false);
    }
  }, []);

  const beginChallenge = useCallback((kind = exercise, nextDifficulty = difficulty) => {
    const nextValue = randomValueForDifficulty(nextDifficulty);
    setExercise(kind);
    setTargetValue(nextValue);
    setReadAnswer("");
    setFeedback(null);
    setSelectedRod(null);
    setChallengeId((value) => value + 1);
    setAnsweredChallengeId(null);
    challengeStartedAtRef.current = Date.now();

    window.requestAnimationFrame(() => {
      if (kind === "read") {
        abacusRef.current?.loadValue(nextValue);
      } else {
        abacusRef.current?.loadValue(0);
      }
    });
  }, [difficulty, exercise]);

  useEffect(() => {
    window.requestAnimationFrame(() => abacusRef.current?.loadValue(0));
  }, []);

  useEffect(() => {
    if (!speedActive) return undefined;

    const timer = window.setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setSpeedActive(false);
          setFeedback({ type: "info", message: "Speed practice finished. Review your session score below." });
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [speedActive]);

  const recordAttempt = useCallback((correct) => {
    const elapsedMs = Math.max(0, Date.now() - challengeStartedAtRef.current);
    setStats((prev) => ({
      attempts: prev.attempts + 1,
      correct: prev.correct + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
      totalMs: prev.totalMs + elapsedMs,
      bestMs: correct ? (prev.bestMs === null ? elapsedMs : Math.min(prev.bestMs, elapsedMs)) : prev.bestMs
    }));
    return elapsedMs;
  }, []);

  const handleResult = useCallback((correct, correctValue) => {
    const alreadyScored = answeredChallengeId === challengeId;

    if (!alreadyScored) {
      recordAttempt(correct);
      setAnsweredChallengeId(challengeId);
    }
    playFeedbackTone(correct);

    if (correct) {
      setFeedback({ type: "success", message: "Correct! Excellent abacus work." });
      if (speedActive && exercise === "make") {
        window.setTimeout(() => beginChallenge("make"), 300);
      }
    } else {
      setFeedback({
        type: "error",
        message: exercise === "make"
          ? `Not yet. Your abacus shows ${formatValue(currentValue)}. Target is ${formatValue(correctValue)}.`
          : `Not correct. The abacus shows ${formatValue(correctValue)}.`
      });
    }
  }, [answeredChallengeId, beginChallenge, challengeId, currentValue, exercise, playFeedbackTone, recordAttempt, speedActive]);

  const checkMakeAnswer = () => handleResult(sameAbacusValue(currentValue, targetValue), targetValue);

  const checkReadAnswer = () => {
    const numericAnswer = Number(String(readAnswer).replace(/,/g, "").trim());
    const valid = Number.isFinite(numericAnswer) && sameAbacusValue(numericAnswer, targetValue);
    handleResult(valid, targetValue);
  };

  const showHint = () => {
    if (exercise === "read") {
      setFeedback({ type: "info", message: "Read each rod from left to right. Upper bead = 5, each lower bead = 1 of that rod's place value." });
      return;
    }

    const difference = targetValue - currentValue;
    if (sameAbacusValue(difference, 0)) {
      setFeedback({ type: "success", message: "You already match the target. Press Check Answer." });
      return;
    }

    setFeedback({
      type: "info",
      message: difference > 0
        ? `Your value is low by ${formatValue(Math.abs(difference))}. Add bead value toward the beam.`
        : `Your value is high by ${formatValue(Math.abs(difference))}. Move bead value away from the beam.`
    });
  };

  const startSpeedPractice = () => {
    if (secondsLeft <= 0 || secondsLeft === 120) {
      setSecondsLeft(120);
      beginChallenge("make");
    }
    setSpeedActive(true);
  };

  const stopSpeedPractice = () => setSpeedActive(false);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await pageRef.current?.requestFullscreen?.();
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      setFeedback({ type: "info", message: "Fullscreen is not available in this browser." });
    }
  };

  const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : 0;
  const averageMs = stats.attempts ? Math.round(stats.totalMs / stats.attempts) : 0;
  const decomposition = useMemo(() => decomposeValue(currentValue), [currentValue]);
  const speedMinutes = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const speedSeconds = String(secondsLeft % 60).padStart(2, "0");

  return (
    <div className="va-learning" ref={pageRef}>
      <div className="va-learning__toolbar card">
        <div className="va-learning__group">
          <strong>Display</strong>
          <div className="va-learning__actions">
            <button className={`button secondary ${showValue ? "va-is-active" : ""}`} type="button" onClick={() => setShowValue((value) => !value)}>
              {showValue ? "Hide Value" : "Show Value"}
            </button>
            <button className={`button secondary ${showLabels ? "va-is-active" : ""}`} type="button" onClick={() => setShowLabels((value) => !value)}>
              {showLabels ? "Hide Labels" : "Show Labels"}
            </button>
          </div>
        </div>

        <div className="va-learning__group">
          <strong>Practice Mode</strong>
          <div className="va-learning__actions">
            {Object.entries(DIFFICULTY_CONFIG).map(([key, config]) => (
              <button
                key={key}
                className={`button secondary ${difficulty === key ? "va-is-active" : ""}`}
                type="button"
                onClick={() => {
                  configureDifficulty(key);
                  beginChallenge(exercise, key);
                }}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        <div className="va-learning__group">
          <strong>Tools</strong>
          <div className="va-learning__actions">
            <button className="button secondary" type="button" onClick={() => abacusRef.current?.undo()}>Undo</button>
            <button className="button secondary" type="button" onClick={() => abacusRef.current?.redo()}>Redo</button>
            <button className="button secondary" type="button" onClick={() => abacusRef.current?.reset()}>Reset</button>
            <button className="button secondary" type="button" onClick={showHint}>Hint</button>
          </div>
        </div>

        <div className="va-learning__group">
          <strong>View</strong>
          <div className="va-learning__actions">
            <button className="button secondary" type="button" onClick={toggleFullscreen}>Fullscreen</button>
            <button className={`button secondary ${soundEnabled ? "va-is-active" : ""}`} type="button" onClick={() => setSoundEnabled((value) => !value)}>
              Sound {soundEnabled ? "On" : "Off"}
            </button>
          </div>
        </div>
      </div>

      <div className="va-learning__exercise-switch card">
        <button className={`button secondary ${exercise === "make" ? "va-is-active" : ""}`} type="button" onClick={() => beginChallenge("make")}>Make This Number</button>
        <button className={`button secondary ${exercise === "read" ? "va-is-active" : ""}`} type="button" onClick={() => beginChallenge("read")}>Read the Abacus</button>
      </div>

      <div className="va-learning__layout">
        <div className="va-learning__main">
          <div className="card va-learning__challenge">
            {exercise === "make" ? (
              <>
                <div>
                  <div className="muted">Target Number</div>
                  <div className="va-learning__target">{formatValue(targetValue)}</div>
                </div>
                <div className="va-learning__actions">
                  <button className="button" type="button" onClick={checkMakeAnswer}>Check Answer</button>
                  <button className="button secondary" type="button" onClick={() => beginChallenge("make")}>New Target</button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <div className="muted">What number is shown on the abacus?</div>
                  <div className="va-learning__target">?</div>
                </div>
                <div className="va-learning__read-answer">
                  <input
                    className="input"
                    inputMode="decimal"
                    placeholder="Enter your answer"
                    value={readAnswer}
                    onChange={(event) => setReadAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") checkReadAnswer();
                    }}
                  />
                  <button className="button" type="button" onClick={checkReadAnswer}>Check</button>
                  <button className="button secondary" type="button" onClick={() => beginChallenge("read")}>New Abacus</button>
                </div>
              </>
            )}
          </div>

          {feedback ? (
            <div className={`va-learning__feedback va-learning__feedback--${feedback.type}`} role="status">
              {feedback.message}
            </div>
          ) : null}

          <div className="card va-learning__abacus-card">
            <VirtualAbacus
              ref={abacusRef}
              columns={13}
              fractionalRods={6}
              markerExponents={STANDARD_PLACE_MARKERS}
              showValue={showValue && exercise === "make"}
              showLabels={showLabels}
              showReset={false}
              interactive={exercise === "make"}
              onValueChange={setCurrentValue}
              onRodSelect={setSelectedRod}
            />
          </div>

          <div className="card va-learning__place-guide">
            <div className="va-learning__section-title">Place Value Guide — Rod 7 is always Units</div>
            <div className="va-learning__place-grid">
              {PLACE_GUIDE.map((item) => (
                <div key={item.rod} className={`va-learning__place-item ${item.rod === 7 ? "va-learning__place-item--units" : ""}`}>
                  <strong>{item.rod}</strong>
                  <span>{item.label}</span>
                  <small>10<sup>{item.exponent}</sup>{STANDARD_PLACE_MARKERS.includes(item.exponent) ? "  ●" : ""}</small>
                </div>
              ))}
            </div>
          </div>

          <div className="va-learning__info-grid">
            <div className="card">
              <div className="va-learning__section-title">Rod Information</div>
              {selectedRod ? (
                <div className="va-learning__detail-list">
                  <div><span>Rod</span><strong>{selectedRod.rodNumber}</strong></div>
                  <div><span>Place</span><strong>{selectedRod.placeLabel}</strong></div>
                  <div><span>Digit</span><strong>{selectedRod.digit}</strong></div>
                  <div><span>Contribution</span><strong>{formatValue(selectedRod.contribution)}</strong></div>
                </div>
              ) : (
                <div className="muted">Move a bead to see information about that rod.</div>
              )}
            </div>

            <div className="card">
              <div className="va-learning__section-title">Number Breakdown</div>
              {exercise === "read" ? (
                <div className="muted">Hidden during Read the Abacus so the answer is not revealed.</div>
              ) : decomposition.length ? (
                <div className="va-learning__decomposition">
                  {decomposition.map((item) => (
                    <span key={item.rod}>{item.digit} {item.label} = {formatValue(item.contribution)}</span>
                  ))}
                </div>
              ) : (
                <div className="muted">The current abacus value is zero.</div>
              )}
            </div>

            <div className="card">
              <div className="va-learning__section-title">Quick Rules</div>
              <div className="va-learning__rules">
                <span>Upper bead = 5 of that rod value.</span>
                <span>Each lower bead = 1 of that rod value.</span>
                <span>Beads touching the beam are counted.</span>
                <span>White dots repeat every third rod: 1, 4, 7, 10, 13.</span>
              </div>
            </div>
          </div>
        </div>

        <aside className="va-learning__side">
          <div className="card">
            <div className="va-learning__section-title">Practice Stats</div>
            <div className="va-learning__detail-list">
              <div><span>Questions</span><strong>{stats.attempts}</strong></div>
              <div><span>Correct</span><strong>{stats.correct}</strong></div>
              <div><span>Wrong</span><strong>{stats.wrong}</strong></div>
              <div><span>Accuracy</span><strong>{accuracy}%</strong></div>
              <div><span>Best Time</span><strong>{stats.bestMs === null ? "—" : `${(stats.bestMs / 1000).toFixed(1)}s`}</strong></div>
              <div><span>Average</span><strong>{stats.attempts ? `${(averageMs / 1000).toFixed(1)}s` : "—"}</strong></div>
            </div>
            <button className="button secondary va-learning__full-button" type="button" onClick={() => setStats(createStats())}>Reset Stats</button>
          </div>

          <div className="card va-learning__speed-card">
            <div className="va-learning__section-title">2-Minute Speed Practice</div>
            <div className="va-learning__timer">{speedMinutes}:{speedSeconds}</div>
            {speedActive ? (
              <button className="button secondary va-learning__full-button" type="button" onClick={stopSpeedPractice}>Pause</button>
            ) : (
              <button className="button va-learning__full-button" type="button" onClick={startSpeedPractice}>
                {secondsLeft > 0 && secondsLeft < 120 ? "Resume" : "Start"}
              </button>
            )}
          </div>

          <div className="card">
            <div className="va-learning__section-title">Daily Practice Tip</div>
            <div className="muted">Start with Beginner mode, keep labels visible, then hide Value. Move to Challenge mode only after you can read place values without help.</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export { StudentVirtualAbacusLearning };
