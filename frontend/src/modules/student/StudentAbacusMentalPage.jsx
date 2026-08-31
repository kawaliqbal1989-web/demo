import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { recordStudentArenaSession } from "../../services/studentArenaService";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import {
  ArenaMobileHandoff,
  getArenaQueryNumber,
  getArenaQueryValue
} from "../../components/ArenaMobileHandoff";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];

const STAGES = [
  {
    id: "full",
    title: "Full Abacus",
    description:
      "Keep the abacus and place labels visible while reading the bead value."
  },
  {
    id: "faded",
    title: "Faded Abacus",
    description:
      "Read the same abacus with reduced visual support and no place labels."
  },
  {
    id: "brief",
    title: "Brief Abacus",
    description:
      "See the bead pattern briefly, then continue using the image in your mind."
  },
  {
    id: "mental",
    title: "Mental Image",
    description:
      "See the number briefly, picture it on your mental abacus, then recall it."
  }
];

const ROUND_COUNTS = [5, 10, 20];

const PREVIEW_DURATIONS = [
  { value: 3000, label: "3 sec" },
  { value: 2000, label: "2 sec" },
  { value: 1000, label: "1 sec" },
  { value: 700, label: "0.7 sec" },
  { value: 500, label: "0.5 sec" }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function createTarget(digits) {
  const safeDigits = Math.max(
    1,
    Math.min(5, Number(digits) || 1)
  );

  const min =
    safeDigits === 1
      ? 1
      : 10 ** (safeDigits - 1);

  const max = (10 ** safeDigits) - 1;

  return randomInt(min, max);
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

function getAdaptiveAbacusLayout(integerPlaces, decimalPlaces = 0) {
  const safeIntegerPlaces = Math.max(1, Math.min(15, Math.trunc(Number(integerPlaces) || 1)));
  const safeDecimalPlaces = Math.max(0, Math.min(14, Math.trunc(Number(decimalPlaces) || 0)));
  const requiredRods = Math.min(15, safeIntegerPlaces + safeDecimalPlaces);

  let columns;
  if (requiredRods <= 4) columns = 5;
  else if (requiredRods === 5) columns = 6;
  else if (requiredRods <= 8) columns = 9;
  else if (requiredRods === 9) columns = 10;
  else if (requiredRods === 10) columns = 11;
  else columns = Math.min(15, requiredRods + 1);

  const spareRods = Math.max(0, columns - requiredRods);
  const rightContextRods = safeDecimalPlaces > 0
    ? 0
    : Math.min(2, Math.max(0, spareRods - 1));

  return {
    columns,
    fractionalRods: Math.min(columns - 1, safeDecimalPlaces + rightContextRods)
  };
}

function MobileMentalHandwritingInput({
  children,
  value,
  onChange,
  onSubmit,
  prompt = "Write your answer directly here"
}) {
  const canvasRef = useRef(null);
  const recognizerRef = useRef(null);
  const drawingRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const completedStrokesRef = useRef([]);
  const predictionRequestRef = useRef(0);

  const [recognitionState, setRecognitionState] =
    useState("checking");
  const [fallbackInput, setFallbackInput] =
    useState(false);

  const normalizePrediction = (rawValue) => {
    const cleaned = String(rawValue || "")
      .replace(/[\s,]/g, "")
      .replace(/[^0-9.]/g, "");

    const firstDot = cleaned.indexOf(".");
    if (firstDot < 0) {
      return cleaned;
    }

    return (
      cleaned.slice(0, firstDot + 1) +
      cleaned
        .slice(firstDot + 1)
        .replace(/\./g, "")
    );
  };

  const getCanvasContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const context = canvas.getContext("2d");
    if (!context) return null;

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 5;
    context.strokeStyle = "#111827";

    return context;
  };

  const sizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = Math.max(
      1,
      Math.min(
        3,
        Number(window.devicePixelRatio) || 1
      )
    );

    const nextWidth = Math.max(
      1,
      Math.round(rect.width * ratio)
    );
    const nextHeight = Math.max(
      1,
      Math.round(rect.height * ratio)
    );

    if (
      canvas.width !== nextWidth ||
      canvas.height !== nextHeight
    ) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;

      const context = canvas.getContext("2d");
      context?.setTransform(
        ratio,
        0,
        0,
        ratio,
        0,
        0
      );
    }
  };

  const redrawCanvas = () => {
    sizeCanvas();

    const canvas = canvasRef.current;
    const context = getCanvasContext();
    if (!canvas || !context) return;

    const rect = canvas.getBoundingClientRect();
    context.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );

    completedStrokesRef.current.forEach(
      (record) => {
        if (!record.points.length) return;

        context.beginPath();
        record.points.forEach(
          (point, index) => {
            if (index === 0) {
              context.moveTo(
                point.x,
                point.y
              );
            } else {
              context.lineTo(
                point.x,
                point.y
              );
            }
          }
        );
        context.stroke();
      }
    );
  };

  const pointerTypeForApi = (pointerType) => {
    if (pointerType === "pen") {
      return "stylus";
    }

    if (
      pointerType === "mouse" ||
      pointerType === "touch"
    ) {
      return pointerType;
    }

    return "touch";
  };

  const createDrawing = (pointerType) => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return null;

    return recognizer.startDrawing({
      recognitionType: "text",
      inputType:
        pointerTypeForApi(pointerType),
      alternatives: 3,
      graphemeSet: [
        "0", "1", "2", "3", "4",
        "5", "6", "7", "8", "9", "."
      ]
    });
  };

  const getPrediction = async () => {
    const drawing = drawingRef.current;
    if (!drawing) {
      onChange("");
      return;
    }

    const requestId =
      predictionRequestRef.current + 1;
    predictionRequestRef.current =
      requestId;

    setRecognitionState("reading");

    try {
      const predictions =
        await drawing.getPrediction();

      if (
        requestId !==
        predictionRequestRef.current
      ) {
        return;
      }

      const recognized =
        normalizePrediction(
          predictions?.[0]?.text
        );

      onChange(recognized);
      setRecognitionState("ready");
    } catch (_error) {
      if (
        requestId ===
        predictionRequestRef.current
      ) {
        setRecognitionState("ready");
      }
    }
  };

  const rebuildDrawing = async () => {
    drawingRef.current?.clear?.();
    drawingRef.current = null;

    const records =
      completedStrokesRef.current;

    if (!records.length) {
      onChange("");
      redrawCanvas();
      return;
    }

    const drawing = createDrawing(
      records[0]?.pointerType ||
        "touch"
    );

    if (!drawing) return;

    records.forEach((record) => {
      const stroke =
        new window.HandwritingStroke();

      record.points.forEach((point) => {
        stroke.addPoint({
          x: point.x,
          y: point.y,
          t: point.t
        });
      });

      drawing.addStroke(stroke);
    });

    drawingRef.current = drawing;
    redrawCanvas();
    await getPrediction();
  };

  const clearHandwriting = () => {
    predictionRequestRef.current += 1;
    completedStrokesRef.current = [];
    activeStrokeRef.current = null;

    drawingRef.current?.clear?.();
    drawingRef.current = null;

    onChange("");
    redrawCanvas();

    if (
      recognitionState !== "unsupported"
    ) {
      setRecognitionState("ready");
    }
  };

  const undoHandwriting = () => {
    if (
      !completedStrokesRef.current.length
    ) {
      return;
    }

    completedStrokesRef.current =
      completedStrokesRef.current.slice(
        0,
        -1
      );

    rebuildDrawing();
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      const supported =
        typeof navigator !== "undefined" &&
        "createHandwritingRecognizer" in navigator &&
        typeof window !== "undefined" &&
        typeof window.HandwritingStroke === "function";

      if (!supported) {
        setRecognitionState("unsupported");
        return;
      }

      try {
        const recognizer =
          await navigator
            .createHandwritingRecognizer({
              languages: ["en"]
            });

        if (cancelled) {
          recognizer?.finish?.();
          return;
        }

        recognizerRef.current = recognizer;
        setRecognitionState("ready");
      } catch (_error) {
        if (!cancelled) {
          setRecognitionState("unsupported");
        }
      }
    };

    initialize();

    return () => {
      cancelled = true;
      predictionRequestRef.current += 1;
      drawingRef.current?.clear?.();
      drawingRef.current = null;
      recognizerRef.current?.finish?.();
      recognizerRef.current = null;
    };
  }, []);

  useEffect(() => {
    sizeCanvas();
    redrawCanvas();

    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            redrawCanvas();
          })
        : null;

    resizeObserver?.observe(canvas);

    const onResize = () => redrawCanvas();

    window.addEventListener(
      "resize",
      onResize
    );

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener(
        "resize",
        onResize
      );
    };
  }, []);

  const addPoint = (event) => {
    const active = activeStrokeRef.current;
    if (!active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect =
      canvas.getBoundingClientRect();

    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      t: Math.max(
        0,
        Date.now() - active.startedAt
      )
    };

    active.points.push(point);
    active.stroke.addPoint(point);

    const context = getCanvasContext();
    if (!context) return;

    const previous =
      active.points[
        active.points.length - 2
      ];

    if (!previous) {
      context.beginPath();
      context.moveTo(
        point.x,
        point.y
      );
      context.lineTo(
        point.x + 0.01,
        point.y + 0.01
      );
      context.stroke();
      return;
    }

    context.beginPath();
    context.moveTo(
      previous.x,
      previous.y
    );
    context.lineTo(
      point.x,
      point.y
    );
    context.stroke();
  };

  const handlePointerDown = (event) => {
    if (
      recognitionState !== "ready" &&
      recognitionState !== "reading"
    ) {
      return;
    }

    event.preventDefault();
    event.currentTarget
      .setPointerCapture?.(
        event.pointerId
      );

    if (!drawingRef.current) {
      drawingRef.current =
        createDrawing(
          event.pointerType
        );
    }

    if (!drawingRef.current) {
      setRecognitionState("unsupported");
      return;
    }

    activeStrokeRef.current = {
      stroke:
        new window.HandwritingStroke(),
      points: [],
      pointerType:
        event.pointerType || "touch",
      startedAt: Date.now()
    };

    addPoint(event);
  };

  const handlePointerMove = (event) => {
    if (!activeStrokeRef.current) {
      return;
    }

    event.preventDefault();
    addPoint(event);
  };

  const finishStroke = async (event) => {
    const active = activeStrokeRef.current;
    if (!active) return;

    event.preventDefault();
    addPoint(event);

    drawingRef.current?.addStroke(
      active.stroke
    );

    completedStrokesRef.current = [
      ...completedStrokesRef.current,
      {
        points: active.points,
        pointerType:
          active.pointerType
      }
    ];

    activeStrokeRef.current = null;
    await getPrediction();
  };

  if (
    recognitionState === "unsupported" &&
    fallbackInput
  ) {
    return (
      <div className="arena-mobile-handwritingFallback">
        <div className="muted">
          Handwriting recognition is not
          available on this device.
        </div>

        <input
          className="input"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="Enter value"
          style={{
            textAlign: "center",
            fontSize: "2rem"
          }}
        />

        <button
          className="button"
          type="button"
          onClick={onSubmit}
        >
          Check Answer
        </button>
      </div>
    );
  }

  return (
    <div className="arena-mobile-handwritingFrame">
      <div className="arena-mobile-handwritingContent">
        {children}

        <canvas
          ref={canvasRef}
          className="arena-mobile-handwritingCanvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          aria-label="Write your answer with your finger or stylus"
        />

        <div className="arena-mobile-handwritingPrompt">
          {prompt}
        </div>

        <div
          className="arena-mobile-handwritingRecognized"
          aria-live="polite"
        >
          {recognitionState === "checking"
            ? "Preparing handwriting…"
            : recognitionState === "reading"
              ? "Reading…"
              : recognitionState === "unsupported"
                ? "Handwriting unavailable"
                : value
                  ? `Recognised: ${value}`
                  : "Write with finger"}
        </div>
      </div>

      <div className="arena-mobile-handwritingControls">
        {recognitionState === "unsupported" ? (
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              setFallbackInput(true)
            }
          >
            Use number entry
          </button>
        ) : (
          <>
            <button
              className="button secondary"
              type="button"
              onClick={undoHandwriting}
            >
              ↶ Undo
            </button>

            <button
              className="button secondary"
              type="button"
              onClick={clearHandwriting}
            >
              Clear
            </button>

            <button
              className="button"
              type="button"
              onClick={onSubmit}
              disabled={!value}
            >
              ✓ Check
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StudentAbacusMentalPage({
  mobileTaskMode = false,
  mobileTaskConfig = null,
  onMobileTaskComplete = null
}) {
  const abacusRef = useRef(null);
  const answerStartedAtRef = useRef(Date.now());
  const mobileAutoStartRef = useRef(false);
  const mobileCompleteNotifiedRef = useRef(false);
  const desktopSessionSaveStartedRef = useRef(false);
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

  const [stage, setStage] = useState(() =>
    preparedConfig
      ? getArenaQueryValue(
          new URLSearchParams({
            stage: String(preparedConfig.stage || "")
          }),
          "stage",
          STAGES.map((item) => item.id),
          "full"
        )
      : getArenaQueryValue(
          mobileQuery,
          "stage",
          STAGES.map((item) => item.id),
          "full"
        )
  );
  const [digits, setDigits] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            digits: String(preparedConfig.digits ?? "")
          }),
          "digits",
          [1, 2, 3, 4, 5],
          2
        )
      : getArenaQueryNumber(mobileQuery, "digits", [1, 2, 3, 4, 5], 2)
  );
  const [roundCount, setRoundCount] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            roundCount: String(preparedConfig.roundCount ?? "")
          }),
          "roundCount",
          ROUND_COUNTS,
          5
        )
      : getArenaQueryNumber(mobileQuery, "roundCount", ROUND_COUNTS, 5)
  );
  const [previewDuration, setPreviewDuration] = useState(() =>
    preparedConfig
      ? getArenaQueryNumber(
          new URLSearchParams({
            previewDuration: String(preparedConfig.previewDuration ?? "")
          }),
          "previewDuration",
          PREVIEW_DURATIONS.map((item) => item.value),
          1000
        )
      : getArenaQueryNumber(
          mobileQuery,
          "previewDuration",
          PREVIEW_DURATIONS.map((item) => item.value),
          1000
        )
  );

  const [phase, setPhase] = useState("setup");
  const [roundIndex, setRoundIndex] = useState(0);
  const [target, setTarget] = useState(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [results, setResults] = useState([]);

  const selectedStage = useMemo(
    () =>
      STAGES.find((item) => item.id === stage) ||
      STAGES[0],
    [stage]
  );

  const mentalAbacusLayout = useMemo(
    () => (
      mobileTaskMode
        ? getAdaptiveAbacusLayout(digits)
        : { columns: 13, fractionalRods: 6 }
    ),
    [digits, mobileTaskMode]
  );

  const requiresPreview =
    stage === "brief" ||
    stage === "mental";

  const prepareRound = (nextRoundIndex) => {
    const nextTarget = createTarget(digits);

    setRoundIndex(nextRoundIndex);
    setTarget(nextTarget);
    setAnswer("");
    setFeedback(null);

    setPhase(
      requiresPreview
        ? "preview"
        : "answering"
    );
  };

  const startSession = () => {
    desktopSessionSaveStartedRef.current = false;
    setResults([]);
    prepareRound(0);
  };

  useEffect(() => {
    if (!mobileTaskMode || mobileAutoStartRef.current) {
      return;
    }

    mobileAutoStartRef.current = true;
    startSession();
  }, [mobileTaskMode]);

  useEffect(() => {
    if (target === null) {
      return undefined;
    }

    const shouldLoadAbacus =
      phase === "feedback" ||
      (
        stage !== "mental" &&
        (
          phase === "preview" ||
          phase === "answering"
        )
      );

    if (!shouldLoadAbacus) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      abacusRef.current?.loadValue(target);
    });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [phase, stage, target]);

  useEffect(() => {
    if (phase !== "preview") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setPhase("answering");
    }, previewDuration);

    return () =>
      window.clearTimeout(timer);
  }, [phase, previewDuration, target]);

  useEffect(() => {
    if (phase === "answering") {
      answerStartedAtRef.current = Date.now();
    }
  }, [phase, target]);

  const submitAnswer = () => {
    if (
      phase !== "answering" ||
      target === null
    ) {
      return;
    }

    const submittedValue =
      parseNumericAnswer(answer);

    if (submittedValue === null) {
      setFeedback({
        correct: false,
        message:
          "Enter a valid number before checking."
      });
      return;
    }

    const correct =
      submittedValue === target;

    const result = {
      roundNumber: roundIndex + 1,
      target,
      submittedValue,
      correct,
      elapsedMs: Math.max(
        0,
        Date.now() -
          answerStartedAtRef.current
      )
    };

    setResults((current) => [
      ...current,
      result
    ]);

    setFeedback({
      correct,
      message: correct
        ? "Correct! Keep visualising the beads."
        : `Not quite. Correct value: ${target.toLocaleString("en-US")}`
    });

    setPhase("feedback");
  };

  const persistCompletedDesktopSession = async (sessionResults) => {
    if (
      mobileTaskMode ||
      desktopSessionSaveStartedRef.current ||
      !Array.isArray(sessionResults) ||
      !sessionResults.length
    ) {
      return;
    }

    desktopSessionSaveStartedRef.current = true;

    const completedCorrectCount = sessionResults.filter(
      (result) => result.correct
    ).length;

    const totalResponseMs = Math.min(
      86_400_000,
      sessionResults.reduce(
        (total, result) =>
          total + Math.max(0, Number(result.elapsedMs) || 0),
        0
      )
    );

    try {
      await recordStudentArenaSession({
        activityKey: "mental",
        mode: stage,
        attemptCount: sessionResults.length,
        correctCount: completedCorrectCount,
        durationMs: totalResponseMs,
        metrics: {
          stage,
          digits,
          roundCount,
          previewDurationMs: previewDuration,
          wrongCount: sessionResults.length - completedCorrectCount,
          averageResponseMs: sessionResults.length
            ? Math.round(totalResponseMs / sessionResults.length)
            : 0
        }
      });
    } catch (error) {
      console.warn("mental_session_save_failed", error);
    }
  };

  const nextRound = () => {
    if (roundIndex + 1 >= roundCount) {
      setPhase("complete");

      if (!mobileTaskMode) {
        void persistCompletedDesktopSession(results);
      }

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
    desktopSessionSaveStartedRef.current = false;
    setPhase("setup");
    setRoundIndex(0);
    setTarget(null);
    setAnswer("");
    setFeedback(null);
    setResults([]);
  };

  const correctCount = useMemo(
    () =>
      results.filter(
        (result) => result.correct
      ).length,
    [results]
  );

  const wrongCount =
    results.length - correctCount;

  const accuracy = results.length
    ? Math.round(
        (correctCount / results.length) *
          100
      )
    : 0;

  const averageSeconds = results.length
    ? (
        results.reduce(
          (total, result) =>
            total + result.elapsedMs,
          0
        ) /
        results.length /
        1000
      ).toFixed(1)
    : "0.0";

  const progress = Math.min(
    100,
    Math.round(
      (
        (
          roundIndex +
          (phase === "complete" ? 1 : 0)
        ) /
        roundCount
      ) *
        100
    )
  );

  const sessionMessage =
    accuracy >= 90
      ? "Excellent mental image control. Keep the rhythm going with another round."
      : accuracy >= 70
        ? "Good progress. Another round can strengthen the bead image."
        : "Keep training. Review the mistakes, then try the same stage again.";

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
      (total, result) => total + Number(result.elapsedMs || 0),
      0
    );

    onMobileTaskComplete({
      attemptCount: results.length,
      correctCount,
      durationMs: totalResponseMs,
      metrics: {
        stage,
        digits,
        roundCount,
        previewDurationMs: previewDuration,
        wrongCount,
        averageResponseMs: results.length
          ? Math.round(totalResponseMs / results.length)
          : 0,
        source: "arena-mobile-companion"
      }
    });
  }, [
    correctCount,
    digits,
    mobileTaskMode,
    onMobileTaskComplete,
    phase,
    previewDuration,
    results,
    roundCount,
    stage,
    wrongCount
  ]);

  if (mobileTaskMode && phase === "setup") {
    return (
      <div className="arena-mobile-mentalRunner__pending">
        <div>
          <div className="arena-mobile-spinner" aria-hidden="true" />
          <p>Preparing your Mental Abacus round...</p>
        </div>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Mental Abacus</h1>
            <div className="muted">
              Reduce visual support gradually
              and strengthen your mental bead
              image.
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
          <h2>Choose Training Stage</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: 12,
              marginTop: 14
            }}
          >
            {STAGES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`button secondary ${
                  stage === item.id
                    ? "va-is-active"
                    : ""
                }`}
                onClick={() =>
                  setStage(item.id)
                }
                style={{
                  textAlign: "left",
                  minHeight: 135,
                  whiteSpace: "normal"
                }}
              >
                <div className="muted">
                  Stage {index + 1}
                </div>

                <strong
                  style={{
                    display: "block",
                    marginTop: 5
                  }}
                >
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
                  setDigits(
                    Number(event.target.value)
                  )
                }
                style={{ marginTop: 8 }}
              >
                {[1, 2, 3, 4, 5].map(
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
              <strong>Rounds</strong>

              <select
                className="input"
                value={roundCount}
                onChange={(event) =>
                  setRoundCount(
                    Number(event.target.value)
                  )
                }
                style={{ marginTop: 8 }}
              >
                {ROUND_COUNTS.map(
                  (value) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {value} rounds
                    </option>
                  )
                )}
              </select>
            </label>

            {requiresPreview ? (
              <label>
                <strong>
                  Preview time
                </strong>

                <select
                  className="input"
                  value={previewDuration}
                  onChange={(event) =>
                    setPreviewDuration(
                      Number(
                        event.target.value
                      )
                    )
                  }
                  style={{ marginTop: 8 }}
                >
                  {PREVIEW_DURATIONS.map(
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
            ) : null}
          </div>

          <div
            className="muted"
            style={{ marginTop: 16 }}
          >
            Selected:{" "}
            <strong>
              {selectedStage.title}
            </strong>
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
            Start Mental Abacus
          </button>

          <ArenaMobileHandoff
            title="Mental Abacus"
            activityKey="mental"
            config={{
              stage,
              digits,
              roundCount,
              previewDuration
            }}
            buttonLabel="📱 Start Mental Abacus on Mobile"
          />
        </div>
      </div>
    );
  }

  if (mobileTaskMode && phase === "complete") {
    return (
      <div className="arena-mobile-mentalRunner__pending" aria-live="polite">
        <div>
          <div className="arena-mobile-spinner" aria-hidden="true" />
          <p>Submitting your Mental Abacus result...</p>
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
              Mental Abacus Results
            </h1>

            <div className="muted">
              {selectedStage.title} session complete. Choose the next useful challenge without leaving the Arena flow.
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
              "linear-gradient(135deg, #0f766e 0%, #2563eb 52%, #7c3aed 100%)",
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
                MENTAL SESSION COMPLETE
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
                  Avg. response
                </div>
                <strong style={{ fontSize: 21 }}>
                  {averageSeconds}s
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
            <div className="muted">
              Rounds
            </div>
            <h2>{results.length}</h2>
          </div>

          <div className="card">
            <div className="muted">
              Correct
            </div>
            <h2>{correctCount}</h2>
          </div>

          <div className="card">
            <div className="muted">
              Wrong
            </div>
            <h2>{wrongCount}</h2>
          </div>

          <div className="card">
            <div className="muted">
              Accuracy
            </div>
            <h2>{accuracy}%</h2>
          </div>

          <div className="card">
            <div className="muted">
              Avg. response
            </div>
            <h2>{averageSeconds}s</h2>
          </div>
        </div>

        {wrongCount > 0 ? (
          <div
            className="card"
            style={{ marginBottom: 16 }}
          >
            <h2>Review Mistakes</h2>

            <div
              style={{
                display: "grid",
                gap: 10,
                marginTop: 12
              }}
            >
              {results
                .filter(
                  (result) =>
                    !result.correct
                )
                .map((result) => (
                  <div
                    key={
                      result.roundNumber
                    }
                    style={{
                      border:
                        "1px solid var(--border, #e5e7eb)",
                      borderRadius: 8,
                      padding: 12
                    }}
                  >
                    <strong>
                      Round{" "}
                      {result.roundNumber}
                    </strong>

                    <div
                      className="muted"
                      style={{
                        marginTop: 5
                      }}
                    >
                      Your answer:{" "}
                      {result.submittedValue.toLocaleString(
                        "en-US"
                      )}
                      {" · "}
                      Correct:{" "}
                      {result.target.toLocaleString(
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
            <strong style={{ fontSize: 18 }}>
              Keep the session moving
            </strong>
            <div
              className="muted"
              style={{ marginTop: 4 }}
            >
              Repeat this mental stage, switch to Anzan, or race the clock in Speed Challenge.
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
              🧠 Play Again
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

            <Link
              className="button secondary"
              to="/student/virtual-abacus/arena/speed"
              style={{
                minHeight: 48,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              ⏱ Speed Challenge
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

  const showAbacusPreview =
    stage === "brief" &&
    phase === "preview";

  const showPersistentAbacus =
    (
      stage === "full" ||
      stage === "faded"
    ) &&
    phase === "answering";

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Mental Abacus</h1>

          <div className="muted">
            {selectedStage.title} · Round{" "}
            {roundIndex + 1} of{" "}
            {roundCount}
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
        className="card"
        style={{
          textAlign: "center",
          minHeight: 360
        }}
      >
        {phase === "preview" &&
        stage === "mental" ? (
          <>
            <div className="muted">
              Picture this number on your
              mental abacus
            </div>

            <div
              style={{
                fontSize:
                  "clamp(3.5rem, 12vw, 8rem)",
                fontWeight: 800,
                margin: "42px 0"
              }}
            >
              {target?.toLocaleString(
                "en-US"
              )}
            </div>
          </>
        ) : null}

        {showAbacusPreview ? (
          <>
            <div
              className="muted"
              style={{
                marginBottom: 14
              }}
            >
              Remember the bead pattern
            </div>

            <VirtualAbacus
              ref={abacusRef}
              columns={mentalAbacusLayout.columns}
              fractionalRods={mentalAbacusLayout.fractionalRods}
              highlightUnits={mobileTaskMode}
              markerExponents={
                STANDARD_PLACE_MARKERS
              }
              showValue={false}
              showLabels={false}
              showReset={false}
              interactive={false}
            />
          </>
        ) : null}

        {phase === "answering" ? (
          mobileTaskMode ? (
            <>
              <div
                className="muted"
                style={{
                  marginBottom: 10
                }}
              >
                What value did you
                visualise?
              </div>

              <MobileMentalHandwritingInput
                value={answer}
                onChange={setAnswer}
                onSubmit={submitAnswer}
                prompt={
                  showPersistentAbacus
                    ? "Write directly on the abacus"
                    : "Write your answer here"
                }
              >
                {showPersistentAbacus ? (
                  <div
                    style={{
                      opacity:
                        stage === "faded"
                          ? 0.35
                          : 1,
                      transition:
                        "opacity 160ms ease"
                    }}
                  >
                    <VirtualAbacus
                      ref={abacusRef}
                      columns={
                        mentalAbacusLayout.columns
                      }
                      fractionalRods={
                        mentalAbacusLayout.fractionalRods
                      }
                      highlightUnits
                      markerExponents={
                        STANDARD_PLACE_MARKERS
                      }
                      showValue={false}
                      showLabels={
                        stage === "full"
                      }
                      showReset={false}
                      interactive={false}
                    />
                  </div>
                ) : (
                  <div
                    className="arena-mobile-handwritingBlank"
                    aria-hidden="true"
                  />
                )}
              </MobileMentalHandwritingInput>
            </>
          ) : (
            <>
              {showPersistentAbacus ? (
                <div
                  style={{
                    opacity:
                      stage === "faded"
                        ? 0.35
                        : 1,
                    transition:
                      "opacity 160ms ease"
                  }}
                >
                  <VirtualAbacus
                    ref={abacusRef}
                    columns={
                      mentalAbacusLayout.columns
                    }
                    fractionalRods={
                      mentalAbacusLayout.fractionalRods
                    }
                    highlightUnits={
                      mobileTaskMode
                    }
                    markerExponents={
                      STANDARD_PLACE_MARKERS
                    }
                    showValue={false}
                    showLabels={
                      stage === "full"
                    }
                    showReset={false}
                    interactive={false}
                  />
                </div>
              ) : (
                <div
                  style={{
                    fontSize:
                      "clamp(3rem, 10vw, 6rem)",
                    marginTop: 12
                  }}
                  aria-hidden="true"
                >
                  🧠
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitAnswer();
                }}
                style={{
                  marginTop: 22
                }}
              >
                <div
                  className="muted"
                  style={{
                    marginBottom: 12
                  }}
                >
                  What value did you
                  visualise?
                </div>

                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={answer}
                  onChange={(event) =>
                    setAnswer(
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
                    marginTop: 16
                  }}
                >
                  <button
                    className="button"
                    type="submit"
                    style={{
                      width: "auto"
                    }}
                  >
                    Check Answer
                  </button>
                </div>
              </form>
            </>
          )
        ) : null}

        {phase === "feedback" ? (
          <div aria-live="polite">
            <div
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                marginBottom: 16
              }}
            >
              {feedback?.message}
            </div>

            {!feedback?.correct ? (
              <>
                <div
                  className="muted"
                  style={{
                    marginBottom: 12
                  }}
                >
                  Correct bead image
                </div>

                <VirtualAbacus
                  ref={abacusRef}
                  columns={mentalAbacusLayout.columns}
                  fractionalRods={mentalAbacusLayout.fractionalRods}
                  highlightUnits={mobileTaskMode}
                  markerExponents={
                    STANDARD_PLACE_MARKERS
                  }
                  showValue={false}
                  showLabels
                  showReset={false}
                  interactive={false}
                />
              </>
            ) : null}

            <button
              className="button"
              type="button"
              onClick={nextRound}
              style={{
                width: "auto",
                marginTop: 20
              }}
            >
              {roundIndex + 1 >=
              roundCount
                ? "View Results"
                : "Next Round"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export { StudentAbacusMentalPage };
