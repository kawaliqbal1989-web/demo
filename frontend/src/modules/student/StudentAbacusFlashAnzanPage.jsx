import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArenaMobileHandoff,
  getArenaQueryNumber,
  getArenaQueryValue
} from "../../components/ArenaMobileHandoff";

const NUMBER_COUNTS = [2, 3, 5, 10];
const ROUND_COUNTS = [5, 10, 20];

const FLASH_SPEEDS = [
  { value: 3000, label: "3 sec" },
  { value: 2000, label: "2 sec" },
  { value: 1000, label: "1 sec" },
  { value: 700, label: "0.7 sec" },
  { value: 500, label: "0.5 sec" },
  { value: 300, label: "0.3 sec" }
];

const AUDIO_SPEEDS = [
  { value: 3000, label: "3 sec" },
  { value: 2000, label: "2 sec" },
  { value: 1500, label: "1.5 sec" },
  { value: 1000, label: "1 sec" }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function numberRangeForDigits(digits) {
  const safeDigits = Math.max(1, Math.min(5, Number(digits) || 1));

  return {
    min: safeDigits === 1 ? 1 : 10 ** (safeDigits - 1),
    max: (10 ** safeDigits) - 1
  };
}

function createSequence(digits, count, operationMode) {
  const { min, max } = numberRangeForDigits(digits);

  const firstValue = randomInt(min, max);

  const sequence = [
    {
      operator: null,
      value: firstValue
    }
  ];

  let runningTotal = firstValue;

  for (let index = 1; index < count; index += 1) {
    let operation = operationMode;

    if (operation === "mixed") {
      operation = Math.random() < 0.5 ? "addition" : "subtraction";
    }

    if (operation === "subtraction") {
      const maximumSubtract = Math.min(max, runningTotal);

      if (maximumSubtract < 1) {
        operation = "addition";
      } else {
        const preferredMinimum = Math.min(min, maximumSubtract);
        const value = randomInt(preferredMinimum, maximumSubtract);

        sequence.push({
          operator: "subtraction",
          value
        });

        runningTotal -= value;
        continue;
      }
    }

    const value = randomInt(min, max);

    sequence.push({
      operator: "addition",
      value
    });

    runningTotal += value;
  }

  return {
    items: sequence,
    correctAnswer: runningTotal
  };
}

function formatSequenceItem(item, index) {
  const formatted = item.value.toLocaleString("en-US");

  if (index === 0 || !item.operator) {
    return formatted;
  }

  return item.operator === "addition"
    ? `+ ${formatted}`
    : `− ${formatted}`;
}

function formatSpokenSequenceItem(item, index) {
  if (index === 0 || !item.operator) {
    return String(item.value);
  }

  return item.operator === "addition"
    ? `plus ${item.value}`
    : `minus ${item.value}`;
}

function parseNumericAnswer(value) {
  const parsed = Number(
    String(value || "")
      .replace(/,/g, "")
      .trim()
  );

  return Number.isFinite(parsed) ? parsed : null;
}

function StudentAbacusFlashAnzanPage({
  deliveryMode = "visual",
  arenaPath = "/student/virtual-abacus/arena"
}) {
  const answerStartedAtRef = useRef(Date.now());

  const isAudioMode = deliveryMode === "audio";
  const title = isAudioMode
    ? "Audio Dictation"
    : "Display Dictation";

  const speedOptions = isAudioMode
    ? AUDIO_SPEEDS
    : FLASH_SPEEDS;

  const mobileQuery = useMemo(
    () => new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : ""
    ),
    []
  );

  const speechSupported =
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window;

  const [voices, setVoices] = useState([]);
  const [selectedVoiceUri, setSelectedVoiceUri] =
    useState("");

  useEffect(() => {
    if (!isAudioMode || !speechSupported) {
      return undefined;
    }

    const synth = window.speechSynthesis;

    const loadVoices = () => {
      const nextVoices = synth
        .getVoices()
        .slice()
        .sort((left, right) =>
          `${left.lang} ${left.name}`.localeCompare(
            `${right.lang} ${right.name}`
          )
        );

      setVoices(nextVoices);
      setSelectedVoiceUri((current) => {
        if (
          current &&
          nextVoices.some(
            (voice) => voice.voiceURI === current
          )
        ) {
          return current;
        }

        const preferred =
          nextVoices.find((voice) =>
            /^en(?:-|_)/i.test(voice.lang || "")
          ) ||
          nextVoices[0] ||
          null;

        return preferred?.voiceURI || "";
      });
    };

    loadVoices();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", loadVoices);
      return () =>
        synth.removeEventListener(
          "voiceschanged",
          loadVoices
        );
    }

    const previousHandler = synth.onvoiceschanged;
    synth.onvoiceschanged = loadVoices;

    return () => {
      if (synth.onvoiceschanged === loadVoices) {
        synth.onvoiceschanged = previousHandler || null;
      }
    };
  }, [isAudioMode, speechSupported]);

  const [digits, setDigits] = useState(() =>
    getArenaQueryNumber(mobileQuery, "digits", [1, 2, 3, 4, 5], 1)
  );
  const [numberCount, setNumberCount] = useState(() =>
    getArenaQueryNumber(mobileQuery, "numberCount", NUMBER_COUNTS, 5)
  );
  const [roundCount, setRoundCount] = useState(() =>
    getArenaQueryNumber(mobileQuery, "roundCount", ROUND_COUNTS, 5)
  );
  const [flashDuration, setFlashDuration] = useState(() =>
    getArenaQueryNumber(
      mobileQuery,
      "flashDuration",
      speedOptions.map((item) => item.value),
      1000
    )
  );
  const [operationMode, setOperationMode] = useState(() =>
    getArenaQueryValue(
      mobileQuery,
      "operationMode",
      ["addition", "subtraction", "mixed"],
      "mixed"
    )
  );

  const [phase, setPhase] = useState("setup");
  const [roundIndex, setRoundIndex] = useState(0);
  const [sequence, setSequence] = useState(null);
  const [flashIndex, setFlashIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState([]);

  const prepareRound = (nextRoundIndex) => {
    const nextSequence = createSequence(
      digits,
      numberCount,
      operationMode
    );

    setRoundIndex(nextRoundIndex);
    setSequence(nextSequence);
    setFlashIndex(0);
    setCountdown(3);
    setAnswer("");
    setFeedback(null);
    setPhase("countdown");
  };

  const speakText = (textToSpeak) => {
    if (!isAudioMode || !speechSupported) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new window.SpeechSynthesisUtterance(textToSpeak);

    utterance.rate =
      flashDuration <= 1000
        ? 1.35
        : 1.05;

    utterance.pitch = 1;

    const selectedVoice = voices.find(
      (voice) => voice.voiceURI === selectedVoiceUri
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    window.speechSynthesis.speak(utterance);
  };

  const startSession = () => {
    if (isAudioMode && !speechSupported) {
      return;
    }

    if (isAudioMode) {
      speakText("Ready");
    }

    setResults([]);
    prepareRound(0);
  };

  useEffect(() => {
    if (phase !== "countdown") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown((current) => current - 1);
        return;
      }

      setFlashIndex(0);
      setPhase("flashing");
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [countdown, phase]);

  useEffect(() => {
    if (phase !== "flashing" || !sequence) {
      return undefined;
    }

    if (isAudioMode && speechSupported) {
      speakText(
        formatSpokenSequenceItem(
          sequence.items[flashIndex],
          flashIndex
        )
      );
    }

    const timer = window.setTimeout(() => {
      if (flashIndex + 1 < sequence.items.length) {
        setFlashIndex((current) => current + 1);
        return;
      }

      answerStartedAtRef.current = Date.now();
      setPhase("answering");
    }, flashDuration);

    return () => window.clearTimeout(timer);
  }, [
    flashDuration,
    flashIndex,
    isAudioMode,
    phase,
    sequence,
    speechSupported
  ]);

  useEffect(() => {
    return () => {
      if (isAudioMode && speechSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isAudioMode, speechSupported]);

  const submitAnswer = () => {
    if (!sequence || phase !== "answering") {
      return;
    }

    const submittedValue = parseNumericAnswer(answer);

    if (submittedValue === null) {
      setFeedback({
        correct: false,
        message: "Enter a valid number before checking."
      });
      return;
    }

    const correct = submittedValue === sequence.correctAnswer;

    const result = {
      roundNumber: roundIndex + 1,
      items: sequence.items,
      submittedValue,
      correctAnswer: sequence.correctAnswer,
      correct,
      elapsedMs: Math.max(
        0,
        Date.now() - answerStartedAtRef.current
      )
    };

    setResults((current) => [...current, result]);

    setFeedback({
      correct,
      message: correct
        ? "Correct! Excellent mental calculation."
        : `Not quite. Correct answer: ${sequence.correctAnswer.toLocaleString("en-US")}`
    });

    setPhase("feedback");
  };

  const nextRound = () => {
    if (roundIndex + 1 >= roundCount) {
      setPhase("complete");
      return;
    }

    prepareRound(roundIndex + 1);
  };

  useEffect(() => {
    const handleArenaEnter = (event) => {
      if (event.key !== "Enter" || event.repeat || phase !== "feedback") {
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
      nextRound();
    };

    window.addEventListener("keydown", handleArenaEnter);
    return () => window.removeEventListener("keydown", handleArenaEnter);
  }, [phase, roundIndex, roundCount]);

  const resetToSetup = () => {
    if (isAudioMode && speechSupported) {
      window.speechSynthesis.cancel();
    }

    setPhase("setup");
    setRoundIndex(0);
    setSequence(null);
    setFlashIndex(0);
    setCountdown(3);
    setAnswer("");
    setFeedback(null);
    setResults([]);
  };

  const correctCount = useMemo(
    () => results.filter((result) => result.correct).length,
    [results]
  );

  const wrongCount = results.length - correctCount;

  const accuracy = results.length
    ? Math.round((correctCount / results.length) * 100)
    : 0;

  const averageAnswerSeconds = results.length
    ? (
        results.reduce(
          (total, result) => total + result.elapsedMs,
          0
        ) /
        results.length /
        1000
      ).toFixed(1)
    : "0.0";

  const progress = Math.min(
    100,
    Math.round(
      ((roundIndex + (phase === "complete" ? 1 : 0)) /
        roundCount) *
        100
    )
  );

  const switchModePath = isAudioMode
    ? `${arenaPath}/flash-anzan`
    : `${arenaPath}/audio-anzan`;

  const switchModeLabel = isAudioMode
    ? "Try Display Dictation"
    : "Try Audio Dictation";

  const sessionMessage =
    accuracy >= 90
      ? "Excellent run. Keep the rhythm going with another challenge."
      : accuracy >= 70
        ? "Good progress. Another round can help make the pattern feel automatic."
        : "Keep training. Review the missed rounds, then try again with the same settings.";

  if (phase === "setup") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>{title}</h1>
            <div className="muted">
              {isAudioMode
                ? "Listen to the numbers, calculate mentally, and enter only the final answer."
                : "Watch numbers flash one by one, calculate mentally, and enter only the final answer."}
            </div>
          </div>

          <Link
            className="button secondary"
            to={arenaPath}
            style={{ width: "auto" }}
          >
            Back to Arena
          </Link>
        </div>

        <div className="card">
          <h2>Session Settings</h2>

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
              <strong>Digits</strong>
              <select
                className="input"
                value={digits}
                onChange={(event) =>
                  setDigits(Number(event.target.value))
                }
                style={{ marginTop: 8 }}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} digit{value === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <strong>Numbers per round</strong>
              <select
                className="input"
                value={numberCount}
                onChange={(event) =>
                  setNumberCount(Number(event.target.value))
                }
                style={{ marginTop: 8 }}
              >
                {NUMBER_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} numbers
                  </option>
                ))}
              </select>
            </label>

            <label>
              <strong>Rounds</strong>
              <select
                className="input"
                value={roundCount}
                onChange={(event) =>
                  setRoundCount(Number(event.target.value))
                }
                style={{ marginTop: 8 }}
              >
                {ROUND_COUNTS.map((value) => (
                  <option key={value} value={value}>
                    {value} rounds
                  </option>
                ))}
              </select>
            </label>

            <label>
              <strong>
                {isAudioMode
                  ? "Audio interval"
                  : "Flash speed"}
              </strong>
              <select
                className="input"
                value={flashDuration}
                onChange={(event) =>
                  setFlashDuration(Number(event.target.value))
                }
                style={{ marginTop: 8 }}
              >
                {speedOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <strong>Operations</strong>
              <select
                className="input"
                value={operationMode}
                onChange={(event) =>
                  setOperationMode(event.target.value)
                }
                style={{ marginTop: 8 }}
              >
                <option value="addition">Addition</option>
                <option value="subtraction">Subtraction</option>
                <option value="mixed">Mixed</option>
              </select>
            </label>
            {isAudioMode && speechSupported ? (
              <label>
                <strong>Voice</strong>
                <select
                  className="input"
                  value={selectedVoiceUri}
                  onChange={(event) =>
                    setSelectedVoiceUri(event.target.value)
                  }
                  style={{ marginTop: 8 }}
                >
                  {voices.length ? (
                    voices.map((voice) => (
                      <option
                        key={voice.voiceURI}
                        value={voice.voiceURI}
                      >
                        {voice.name} ({voice.lang})
                      </option>
                    ))
                  ) : (
                    <option value="">
                      System default voice
                    </option>
                  )}
                </select>
              </label>
            ) : null}
          </div>

          {isAudioMode && !speechSupported ? (
            <div
              className="muted"
              style={{ marginTop: 18 }}
              role="alert"
            >
              Audio Dictation is not supported by this browser.
              Please use a current browser with speech
              synthesis enabled.
            </div>
          ) : null}

          {isAudioMode && speechSupported ? (
            <button
              className="button secondary"
              type="button"
              onClick={() =>
                speakText("Audio Dictation voice check")
              }
              style={{
                width: "auto",
                marginTop: 20,
                marginRight: 10
              }}
            >
              Test Sound
            </button>
          ) : null}

          <button
            className="button"
            type="button"
            onClick={startSession}
            disabled={isAudioMode && !speechSupported}
            style={{ width: "auto", marginTop: 20 }}
          >
            Start {title}
          </button>

          <ArenaMobileHandoff
            title={title}
            path={
              isAudioMode
                ? `${arenaPath}/audio-anzan`
                : `${arenaPath}/flash-anzan`
            }
            params={{
              digits,
              numberCount,
              roundCount,
              flashDuration,
              operationMode
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
            <h1>{title} Score Card</h1>
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
              "linear-gradient(135deg, #4f46e5 0%, #7c3aed 55%, #db2777 100%)",
            boxShadow: "0 18px 38px rgba(79, 70, 229, 0.20)"
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
                SESSION COMPLETE
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
                <div style={{ fontSize: 11, opacity: 0.76 }}>Correct</div>
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
                <div style={{ fontSize: 11, opacity: 0.76 }}>Avg. answer</div>
                <strong style={{ fontSize: 21 }}>
                  {averageAnswerSeconds}s
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
          <div className="card">
            <div className="muted">Rounds</div>
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

          <div className="card">
            <div className="muted">Avg. answer time</div>
            <h2>{averageAnswerSeconds}s</h2>
          </div>
        </div>

        {wrongCount > 0 ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2>Review Missed Rounds</h2>

            <div
              style={{
                display: "grid",
                gap: 12,
                marginTop: 12
              }}
            >
              {results
                .filter((result) => !result.correct)
                .map((result) => (
                  <div
                    key={result.roundNumber}
                    style={{
                      border:
                        "1px solid var(--border, #e5e7eb)",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <strong>
                      Round {result.roundNumber}
                    </strong>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginTop: 8
                      }}
                    >
                      {result.items.map((item, index) => (
                        <span
                          key={`${result.roundNumber}-${index}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 8,
                            border:
                              "1px solid var(--border, #e5e7eb)"
                          }}
                        >
                          {formatSequenceItem(item, index)}
                        </span>
                      ))}
                    </div>

                    <div
                      className="muted"
                      style={{ marginTop: 8 }}
                    >
                      Your answer:{" "}
                      {result.submittedValue.toLocaleString(
                        "en-US"
                      )}
                      {" · "}
                      Correct:{" "}
                      {result.correctAnswer.toLocaleString(
                        "en-US"
                      )}
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
            <strong style={{ fontSize: 18 }}>Keep the session moving</strong>
            <div className="muted" style={{ marginTop: 4 }}>
              Play again with the same settings, switch Anzan mode, or jump into another Arena challenge.
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
              style={{
                minHeight: 48
              }}
            >
              ⚡ Play Again
            </button>

            <Link
              className="button secondary"
              to={switchModePath}
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              🔄 {switchModeLabel}
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
              to={arenaPath}
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
          <h1>{title}</h1>
          <div className="muted">
            Round {roundIndex + 1} of {roundCount}
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

      <div
        className="card"
        style={{
          textAlign: "center",
          minHeight: 360,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {phase === "countdown" ? (
          <>
            <div className="muted">
              Get ready
            </div>

            <div
              style={{
                fontSize: "clamp(4rem, 14vw, 9rem)",
                lineHeight: 1,
                fontWeight: 800,
                marginTop: 20
              }}
            >
              {countdown}
            </div>
          </>
        ) : null}

        {phase === "flashing" && sequence ? (
          <>
            <div className="muted">
              {isAudioMode
                ? "Listen and calculate mentally"
                : "Calculate mentally"}
            </div>

            {isAudioMode ? (
              <div
                aria-label="Audio number playing"
                style={{
                  fontSize: "clamp(3rem, 10vw, 6rem)",
                  lineHeight: 1,
                  fontWeight: 800,
                  marginTop: 28
                }}
              >
                ♪
              </div>
            ) : (
              <div
                style={{
                  fontSize:
                    "clamp(3.5rem, 12vw, 8rem)",
                  lineHeight: 1.1,
                  fontWeight: 800,
                  marginTop: 24
                }}
              >
                {formatSequenceItem(
                  sequence.items[flashIndex],
                  flashIndex
                )}
              </div>
            )}

            <div
              className="muted"
              style={{ marginTop: 22 }}
            >
              Number {flashIndex + 1} of{" "}
              {sequence.items.length}
            </div>
          </>
        ) : null}

        {phase === "answering" ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              submitAnswer();
            }}
            style={{ width: "100%" }}
          >
            <div
              style={{
                fontSize: "clamp(2rem, 7vw, 4rem)",
                fontWeight: 800,
                marginBottom: 12
              }}
            >
              ?
            </div>

            <div
              className="muted"
              style={{ marginBottom: 16 }}
            >
              Enter the final total
            </div>

            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoFocus
              value={answer}
              onChange={(event) =>
                setAnswer(event.target.value)
              }
              placeholder="Final answer"
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

        {phase === "feedback" && sequence ? (
          <div
            aria-live="polite"
            style={{ width: "100%" }}
          >
            <div
              style={{
                fontSize: "1.4rem",
                fontWeight: 700
              }}
            >
              {feedback?.message}
            </div>

            {!feedback?.correct ? (
              <div style={{ marginTop: 18 }}>
                <div className="muted">
                  Sequence
                </div>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 10
                  }}
                >
                  {sequence.items.map((item, index) => (
                    <span
                      key={index}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        border:
                          "1px solid var(--border, #e5e7eb)"
                      }}
                    >
                      {formatSequenceItem(item, index)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <button
              className="button"
              type="button"
              onClick={nextRound}
              style={{ width: "auto", marginTop: 22 }}
            >
              {roundIndex + 1 >= roundCount
                ? "View Results"
                : "Next Round"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { StudentAbacusFlashAnzanPage };
