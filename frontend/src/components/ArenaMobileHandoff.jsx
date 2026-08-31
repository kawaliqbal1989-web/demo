import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  createStudentArenaMobileTask,
  getStudentArenaMobileTaskStatus
} from "../services/studentArenaService";

function getArenaQueryValue(searchParams, key, allowedValues, fallback) {
  const value = String(searchParams?.get(key) || "").trim();
  return allowedValues.includes(value) ? value : fallback;
}

function getArenaQueryNumber(searchParams, key, allowedValues, fallback) {
  const value = Number(searchParams?.get(key));
  return allowedValues.includes(value) ? value : fallback;
}

function ArenaMobileHandoff({
  title,
  path,
  params,
  activityKey = "",
  config = null,
  buttonLabel = ""
}) {
  const [open, setOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const [task, setTask] = useState(null);
  const [creatingTask, setCreatingTask] = useState(false);
  const [statusError, setStatusError] = useState("");

  const secureMode = Boolean(String(activityKey || "").trim());
  const serializedParams = JSON.stringify(params || {});
  const serializedConfig = JSON.stringify(config || {});

  const terminalStatuses = useMemo(
    () => new Set(["SUBMITTED", "EXPIRED", "CANCELLED"]),
    []
  );

  const handoffUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }

    if (secureMode) {
      if (!task?.mobilePath) {
        return "";
      }

      return new URL(task.mobilePath, window.location.origin).toString();
    }

    const url = new URL(path, window.location.origin);
    const safeParams = JSON.parse(serializedParams);

    Object.entries(safeParams).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") {
        return;
      }

      url.searchParams.set(key, String(value));
    });

    return url.toString();
  }, [path, secureMode, serializedParams, task?.mobilePath]);

  useEffect(() => {
    if (!open || !handoffUrl) {
      return undefined;
    }

    let cancelled = false;
    setQrDataUrl("");
    setQrError("");

    QRCode.toDataURL(handoffUrl, {
      width: 260,
      margin: 2,
      errorCorrectionLevel: "M"
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError("Could not generate the mobile QR code.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [handoffUrl, open]);

  useEffect(() => {
    if (
      !secureMode ||
      !open ||
      !task?.id ||
      terminalStatuses.has(task.status)
    ) {
      return undefined;
    }

    let cancelled = false;

    const refreshStatus = async () => {
      try {
        const latest = await getStudentArenaMobileTaskStatus(task.id);

        if (!cancelled && latest?.id) {
          setTask((current) => ({
            ...(current || {}),
            ...latest
          }));
          setStatusError("");
        }
      } catch (error) {
        if (!cancelled) {
          setStatusError(
            error?.response?.data?.message ||
              "Could not refresh the mobile task status."
          );
        }
      }
    };

    const timer = window.setInterval(refreshStatus, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, secureMode, task?.id, task?.status, terminalStatuses]);

  const createSecureTask = async () => {
    if (!secureMode || creatingTask) {
      return;
    }

    setCreatingTask(true);
    setOpen(true);
    setQrDataUrl("");
    setQrError("");
    setStatusError("");

    try {
      const created = await createStudentArenaMobileTask({
        activityKey: String(activityKey).trim().toLowerCase(),
        config: JSON.parse(serializedConfig)
      });

      if (!created?.id || !created?.mobilePath) {
        throw new Error("Mobile task response is incomplete.");
      }

      setTask({
        ...created,
        preparedConfigSignature: serializedConfig
      });
    } catch (error) {
      setTask(null);
      setQrError(
        error?.response?.data?.message ||
          error?.message ||
          "Could not prepare the mobile task."
      );
    } finally {
      setCreatingTask(false);
    }
  };

  const handleToggle = async () => {
    if (!secureMode) {
      setOpen((value) => !value);
      return;
    }

    if (open) {
      setOpen(false);
      return;
    }

    const settingsChanged =
      task?.preparedConfigSignature &&
      task.preparedConfigSignature !== serializedConfig;

    if (!task || terminalStatuses.has(task.status) || settingsChanged) {
      await createSecureTask();
      return;
    }

    setOpen(true);
  };

  const statusMeta = {
    READY: {
      label: "Waiting for phone",
      detail: "Scan the QR code with the phone."
    },
    CONNECTED: {
      label: "Phone connected",
      detail: "The task has been securely claimed on the phone."
    },
    IN_PROGRESS: {
      label: "In progress",
      detail: "Mental Abacus is currently running on the phone."
    },
    SUBMITTED: {
      label: "Completed",
      detail: "The phone submitted this Mental Abacus task successfully."
    },
    EXPIRED: {
      label: "Expired",
      detail: "Create a new mobile task to continue."
    },
    CANCELLED: {
      label: "Cancelled",
      detail: "Create a new mobile task to continue."
    }
  }[task?.status] || {
    label: task?.status || "Preparing",
    detail: "Preparing the secure mobile task."
  };

  const settingsChanged =
    Boolean(task?.preparedConfigSignature) &&
    task.preparedConfigSignature !== serializedConfig;

  return (
    <div
      style={{
        marginTop: 18,
        paddingTop: 16,
        borderTop: "1px solid var(--border, #e5e7eb)"
      }}
    >
      <button
        className="button secondary"
        type="button"
        onClick={handleToggle}
        disabled={creatingTask}
        style={{ width: "auto" }}
      >
        {creatingTask
          ? "Preparing Mobile Task..."
          : open
            ? "Hide Mobile QR"
            : buttonLabel ||
              (secureMode
                ? `📱 Start ${title} on Mobile`
                : "📱 Continue on Mobile")}
      </button>

      {open ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 18,
            alignItems: "center",
            marginTop: 16
          }}
        >
          <div
            style={{
              minHeight: 220,
              display: "grid",
              placeItems: "center",
              padding: 12,
              borderRadius: 16,
              background: "#ffffff",
              border: "1px solid var(--border, #e5e7eb)"
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={
                  secureMode
                    ? `QR code to start ${title} on mobile`
                    : `QR code to continue ${title} on mobile`
                }
                width="260"
                height="260"
                style={{
                  width: "100%",
                  maxWidth: 260,
                  height: "auto",
                  display: "block"
                }}
              />
            ) : (
              <div className="muted">
                {qrError ||
                  (secureMode
                    ? "Preparing secure QR code..."
                    : "Generating QR code...")}
              </div>
            )}
          </div>

          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: 18 }}>
              {secureMode
                ? "Scan to start this task"
                : "Scan to continue this setup"}
            </strong>

            <div
              className="muted"
              style={{ marginTop: 7, lineHeight: 1.55 }}
            >
              {secureMode
                ? `This QR opens only the prepared ${title} task. The phone does not need to sign in to the full student website.`
                : `Scan with your phone to open the same ${title} activity and settings. If the phone is not signed in, log in with the same student account first.`}
            </div>

            {secureMode && task ? (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid var(--border, #e5e7eb)",
                  background: "var(--surface-muted, #f8fafc)"
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  Status: {statusMeta.label}
                </div>

                <div className="muted" style={{ marginTop: 4, lineHeight: 1.45 }}>
                  {statusMeta.detail}
                </div>

                {task.expiresAt ? (
                  <div className="muted" style={{ marginTop: 7, fontSize: 12 }}>
                    Task window:{" "}
                    {new Date(task.expiresAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </div>
                ) : null}

                {statusError ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#b91c1c" }}>
                    {statusError}
                  </div>
                ) : null}

                {settingsChanged && !terminalStatuses.has(task.status) ? (
                  <div style={{ marginTop: 8, fontSize: 12, color: "#92400e" }}>
                    Laptop settings changed after this QR was prepared. Hide this
                    QR, then open it again to create a task with the current settings.
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              className="muted"
              style={{ marginTop: 10, fontSize: 12, overflowWrap: "anywhere" }}
            >
              {secureMode
                ? "The QR contains only a one-time mobile-task handoff token. Student and tenant IDs are not placed in the QR."
                : "The QR contains only the Arena activity URL and selected settings."}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export {
  ArenaMobileHandoff,
  getArenaQueryNumber,
  getArenaQueryValue
};
