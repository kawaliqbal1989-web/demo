const FRIENDLY_BY_CODE = {
  INVALID_ACCESS_TOKEN: "Your session has expired. Please log in again.",
  INVALID_REFRESH_TOKEN: "Your session has expired. Please log in again.",
  AUTH_REQUIRED: "Please log in to continue.",
  SUBSCRIPTION_EXPIRED: "Your subscription has expired. Please renew or contact support.",
  DUPLICATE_ACTIVE_ENROLLMENT: "This student is already enrolled in this competition.",
  LEVEL_SKIP_NOT_ALLOWED: "You can’t skip levels. Promote the student one level at a time.",
  WORKFLOW_STAGE_CONFLICT: "This action isn’t allowed in the competition’s current stage.",
  WORKFLOW_REJECTED: "This competition was rejected and can’t be progressed.",
  REJECT_REASON_REQUIRED: "Please provide a reason to reject this competition.",
  COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED: "Competition result publishing is unavailable until result status migration is applied.",

  SESSION_ALREADY_EXISTS: "Attendance session already exists for this batch and date.",

  PRACTICE_NOT_STARTED: "Practice is not started yet.",
  FEATURE_NOT_ASSIGNED: "This feature is not enabled for your student account. Ask your center to assign it first.",
  PRACTICE_CLOSED: "Practice window is closed.",
  EXAM_NOT_LIVE: "Exam is not live yet.",
  EXAM_WINDOW_CLOSED: "Exam window is closed.",
  EXAM_DEVICE_LOCKED: "This exam attempt is locked to another device/session.",
  ENROLLMENT_EXISTS: "This student is already enrolled in this batch.",
  TEACHER_HAS_ACTIVE_STUDENTS: "Cannot suspend teacher while active assigned students exist. Shift or unassign them first.",
  INVALID_TARGET_TEACHER: "Please choose an active teacher from the same center."
  ,DUPLICATE_PENDING: "A reassignment request is already pending for this worksheet."
  ,NO_SUBMISSION: "You can request reassignment only after submitting this worksheet."
  ,SWAP_WORKSHEET_REQUIRED: "Please choose a replacement worksheet for a swap request."
  ,NEW_WORKSHEET_NOT_FOUND: "The selected replacement worksheet was not found."
};

function getApiErrorCode(error) {
  return error?.response?.data?.error_code || null;
}

function getFriendlyErrorMessage(error) {
  const code = getApiErrorCode(error);
  if (code && FRIENDLY_BY_CODE[code]) {
    return FRIENDLY_BY_CODE[code];
  }

  return error?.response?.data?.message || error?.message || "Something went wrong.";
}

function logApiError(error) {
  // Axios cancellation (AbortController) is expected during StrictMode double-invocation
  // and during rapid navigation; don't treat it as a real error.
  if (error?.code === "ERR_CANCELED" || error?.name === "CanceledError" || error?.name === "AbortError") {
    return;
  }

  const status = error?.response?.status;
  const code = getApiErrorCode(error);
  const path = error?.config?.url;
  const method = error?.config?.method;

  // Some 409s are expected control flow (e.g. "create" when record already exists).
  // Avoid polluting the console with noise for these cases.
  if (
    (code === "SESSION_ALREADY_EXISTS" && method === "post" && path === "/teacher/attendance/sessions") ||
    (code === "DUPLICATE_PENDING" && method === "post" && path === "/student/reassignment-requests") ||
    (code === "FEATURE_NOT_ASSIGNED" && method === "get" && path === "/student/practice-worksheets/options") ||
    (code === "FEATURE_NOT_ASSIGNED" && method === "get" && path === "/student/abacus-practice-worksheets/options")
  ) {
    return;
  }

  // Centralized client-side logging for pilot debugging.
  // Avoid dumping request bodies (could contain credentials).
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.error("api_error", {
      status,
      error_code: code,
      method,
      path
    });
  }
}

export { getApiErrorCode, getFriendlyErrorMessage, logApiError };
