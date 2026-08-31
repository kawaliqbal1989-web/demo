import { useEffect, useMemo, useRef, useState } from "react";
import { StudentAbacusMentalPage } from "./StudentAbacusMentalPage";
import { StudentAbacusFlashCardsPage } from "./StudentAbacusFlashCardsPage";
import {
  claimArenaMobileTask,
  startArenaMobileTask,
  submitArenaMobileTask
} from "../../services/arenaMobileTaskPublicService";

const STAGE_LABELS = {
  full: "Full Abacus",
  faded: "Faded Abacus",
  brief: "Brief Abacus",
  mental: "Mental Image"
};

const FLASH_CARD_MODE_LABELS = {
  "number-flash": "Number Flash",
  "abacus-flash": "Flash Card Manual",
  "abacus-auto": "Flash Card Automatic",
  "build-number": "Build the Number (Legacy)",
  "operation-flash": "Operation Flash (Legacy)"
};

function readHandoffTokenFromHash() {
  if (typeof window === "undefined") {
    return "";
  }

  return decodeURIComponent(
    String(window.location.hash || "")
      .replace(/^#/, "")
      .trim()
  );
}

function formatPreviewDuration(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return "—";
  }

  if (number >= 1000) {
    const seconds = number / 1000;
    return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} sec`;
  }

  return `${number} ms`;
}

function getArenaMobileError(error) {
  const status = Number(error?.response?.status || 0);
  const code = String(error?.response?.data?.error_code || "").trim();

  if (code === "ARENA_MOBILE_TASK_EXPIRED" || status === 410) {
    return {
      title: "Task expired",
      message:
        "This mobile task is no longer available. Return to the laptop and create a new mobile task."
    };
  }

  if (code === "ARENA_MOBILE_TASK_ALREADY_CLAIMED") {
    return {
      title: "Task already connected",
      message:
        "This QR task is already connected to another mobile session. Return to the laptop and create a new mobile task if needed."
    };
  }

  if (
    code === "ARENA_MOBILE_TASK_SUBMITTED" ||
    code === "ARENA_MOBILE_TASK_CANCELLED"
  ) {
    return {
      title: "Task unavailable",
      message:
        "This mobile task has already finished or was cancelled."
    };
  }

  if (
    code === "ARENA_MOBILE_TASK_NOT_FOUND" ||
    status === 404
  ) {
    return {
      title: "Task not available",
      message:
        "The QR task could not be found. Scan a fresh QR code from the laptop."
    };
  }

  return {
    title: "Could not connect",
    message:
      "Check your internet connection and try scanning a fresh QR code from the laptop."
  };
}

function StudentArenaMobileTaskPage() {
  const handoffTokenRef = useRef(readHandoffTokenFromHash());
  const [phase, setPhase] = useState(
    handoffTokenRef.current ? "connecting" : "missing"
  );
  const [task, setTask] = useState(null);
  const [claimToken, setClaimToken] = useState("");
  const [errorState, setErrorState] = useState(null);
  const [submissionResult, setSubmissionResult] = useState(null);

  useEffect(() => {
    const handoffToken = handoffTokenRef.current;

    if (!handoffToken) {
      return undefined;
    }

    let cancelled = false;

    claimArenaMobileTask(handoffToken)
      .then((claimedTask) => {
        if (cancelled) {
          return;
        }

        const nextClaimToken = String(
          claimedTask?.claimToken || ""
        ).trim();

        if (!nextClaimToken) {
          throw new Error("Claim token missing from mobile task response");
        }

        setTask(claimedTask);
        setClaimToken(nextClaimToken);
        setPhase("ready");

        if (typeof window !== "undefined") {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}`
          );
        }

        handoffTokenRef.current = "";
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setErrorState(getArenaMobileError(error));
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const config = task?.config || {};
  const activityKey = String(task?.activityKey || "").trim();

  const taskTitle =
    activityKey === "flash-cards"
      ? "Flash Cards"
      : activityKey === "mental"
        ? "Mental Abacus"
        : "Arena Mobile Task";

  const stageLabel = useMemo(
    () =>
      STAGE_LABELS[String(config.stage || task?.mode || "")] ||
      "Mental Abacus",
    [config.stage, task?.mode]
  );

  const flashModeLabel = useMemo(
    () =>
      FLASH_CARD_MODE_LABELS[String(config.mode || task?.mode || "")] ||
      "Flash Cards",
    [config.mode, task?.mode]
  );

  const startTask = async () => {
    if (!claimToken || phase !== "ready") {
      return;
    }

    setPhase("starting");
    setErrorState(null);

    const fullscreenPromise =
      typeof document !== "undefined" &&
      !document.fullscreenElement
        ? document.documentElement.requestFullscreen?.().catch(() => undefined)
        : undefined;

    try {
      const startedTask = await startArenaMobileTask(claimToken);
      await fullscreenPromise;

      setTask((current) => ({
        ...(current || {}),
        ...(startedTask || {})
      }));
      setPhase("started");
    } catch (error) {
      setErrorState(getArenaMobileError(error));
      setPhase("error");
    }
  };

  const completeMobileTask = async (resultPayload) => {
    if (!claimToken || phase !== "started") {
      return;
    }

    setPhase("submitting");
    setErrorState(null);

    try {
      const submitted = await submitArenaMobileTask(
        claimToken,
        resultPayload
      );

      setSubmissionResult(submitted);
      setPhase("submitted");
    } catch (error) {
      setErrorState(getArenaMobileError(error));
      setPhase("submit-error");
    }
  };

  return (
    <main className="arena-mobile-shell">
      <section
        className={`arena-mobile-card ${
          ["started", "submitting"].includes(phase)
            ? "arena-mobile-card--task"
            : ""
        }`}
        aria-live="polite"
      >
        <div className="arena-mobile-brand">
          <div className="arena-mobile-brandMark" aria-hidden="true">
            A
          </div>
          <div>
            <div className="arena-mobile-eyebrow">Abacus Arena</div>
            <h1 className="arena-mobile-title">{taskTitle}</h1>
          </div>
        </div>

        {phase === "connecting" ? (
          <div className="arena-mobile-state">
            <div className="arena-mobile-spinner" aria-hidden="true" />
            <h2>Connecting your task…</h2>
            <p>
              Keep this screen open while the phone securely connects to the task prepared on the laptop.
            </p>
          </div>
        ) : null}

        {phase === "missing" ? (
          <div className="arena-mobile-state">
            <div className="arena-mobile-statusIcon" aria-hidden="true">
              !
            </div>
            <h2>Mobile task link is incomplete</h2>
            <p>
              Scan a fresh “Start on Mobile” QR code from the laptop.
            </p>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="arena-mobile-state">
            <div className="arena-mobile-statusIcon arena-mobile-statusIcon--error" aria-hidden="true">
              !
            </div>
            <h2>{errorState?.title || "Task unavailable"}</h2>
            <p>
              {errorState?.message ||
                "Return to the laptop and create a fresh mobile task."}
            </p>
          </div>
        ) : null}

        {phase === "ready" || phase === "starting" ? (
          <>
            <div className="arena-mobile-connected">
              <span className="arena-mobile-dot" aria-hidden="true" />
              Phone connected
            </div>

            <div className="arena-mobile-taskSummary">
              {activityKey === "flash-cards" ? (
                <>
                  <div>
                    <span>Mode</span>
                    <strong>{flashModeLabel}</strong>
                  </div>
                  <div>
                    <span>Digits</span>
                    <strong>{config.digits ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Cards</span>
                    <strong>{config.cardCount ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Flash</span>
                    <strong>{formatPreviewDuration(config.flashDuration)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Training stage</span>
                    <strong>{stageLabel}</strong>
                  </div>
                  <div>
                    <span>Digits</span>
                    <strong>{config.digits ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Rounds</span>
                    <strong>{config.roundCount ?? "—"}</strong>
                  </div>
                  <div>
                    <span>Preview</span>
                    <strong>{formatPreviewDuration(config.previewDuration)}</strong>
                  </div>
                </>
              )}
            </div>

            <div className="arena-mobile-rotateHint">
              <div className="arena-mobile-phoneIcon" aria-hidden="true">
                ↻
              </div>
              <div>
                <strong>Landscape recommended</strong>
                <span>
                  Rotate your phone sideways for a larger touch abacus in the next screen.
                </span>
              </div>
            </div>

            <button
              type="button"
              className="arena-mobile-primaryButton"
              onClick={startTask}
              disabled={phase === "starting"}
            >
              {phase === "starting"
                ? "Starting…"
                : `Start ${taskTitle}`}
            </button>

            <p className="arena-mobile-securityNote">
              This mobile screen can access only this prepared Arena task. It does not sign your phone into the full student website.
            </p>
          </>
        ) : null}

        {phase === "started" ? (
          activityKey === "flash-cards" ? (
            <div className="arena-mobile-flashCardsRunner">
              <StudentAbacusFlashCardsPage
                mobileTaskMode
                mobileTaskConfig={config}
                onMobileTaskComplete={completeMobileTask}
              />
            </div>
          ) : (
            <div className="arena-mobile-mentalRunner">
              <StudentAbacusMentalPage
                mobileTaskMode
                mobileTaskConfig={config}
                onMobileTaskComplete={completeMobileTask}
              />
            </div>
          )
        ) : null}

        {phase === "submitting" ? (
          <div className="arena-mobile-state">
            <div className="arena-mobile-spinner" aria-hidden="true" />
            <h2>Submitting your result…</h2>
            <p>
              Keep this page open until your Arena result is confirmed.
            </p>
          </div>
        ) : null}

        {phase === "submitted" ? (
          <div className="arena-mobile-state">
            <div
              className="arena-mobile-statusIcon arena-mobile-statusIcon--success"
              aria-hidden="true"
            >
              ✓
            </div>
            <h2>Task submitted</h2>
            <p>
              Your Arena result has been saved. You may close this page.
            </p>

            <div className="arena-mobile-submitSummary">
              <div>
                <span>Rounds</span>
                <strong>{submissionResult?.attemptCount ?? "—"}</strong>
              </div>
              <div>
                <span>Correct</span>
                <strong>{submissionResult?.correctCount ?? "—"}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>
                  {submissionResult?.accuracy === null ||
                  submissionResult?.accuracy === undefined
                    ? "—"
                    : `${submissionResult.accuracy}%`}
                </strong>
              </div>
            </div>
          </div>
        ) : null}

        {phase === "submit-error" ? (
          <div className="arena-mobile-state">
            <div
              className="arena-mobile-statusIcon arena-mobile-statusIcon--error"
              aria-hidden="true"
            >
              !
            </div>
            <h2>{errorState?.title || "Could not submit task"}</h2>
            <p>
              {errorState?.message ||
                "The task result could not be submitted. Keep this page open and return to the laptop for help."}
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export { StudentArenaMobileTaskPage };
