const FRIENDLY_BY_CODE = {
  INVALID_ACCESS_TOKEN: "Your session has expired. Please log in again.",
  INVALID_REFRESH_TOKEN: "Your session has expired. Please log in again.",
  INVALID_CURRENT_PASSWORD: "Current password is incorrect.",
  AUTH_REQUIRED: "Please log in to continue.",
  AUTH_EMAIL_EXISTS: "This student email is already used by another login account. Use a different email or leave Student Email blank.",
  AUTH_USERNAME_EXISTS: "This student code is already used by another login account. Refresh and try again.",
  STUDENT_EMAIL_EXISTS: "This student email already exists in student records. Use a different email or leave it blank.",
  SUBSCRIPTION_EXPIRED: "Your subscription has expired. Please renew or contact support.",
  DUPLICATE_ACTIVE_ENROLLMENT: "This student is already enrolled in this competition.",
  LEVEL_SKIP_NOT_ALLOWED: "You can’t skip levels. Promote the student one level at a time.",
  WORKFLOW_STAGE_CONFLICT: "This action isn’t allowed in the competition’s current stage.",
  WORKFLOW_REJECTED: "This competition was rejected and can’t be progressed.",
  WORKFLOW_VERSION_CONFLICT: "This settlement changed before your action completed. Refresh and try again.",
  INVALID_TRANSITION: "This workflow action is not allowed for the settlement’s current state.",
  WORKFLOW_PERMISSION_DENIED: "Your account cannot perform that settlement workflow action.",
  SETTLEMENT_NOT_FOUND: "This settlement was not found. Refresh the queue and try again.",
  REJECT_REASON_REQUIRED: "Please provide a reason to reject this competition.",
  COMPETITION_RESULT_STATUS_MIGRATION_REQUIRED: "Competition result publishing is unavailable until result status migration is applied.",

  SESSION_ALREADY_EXISTS: "Attendance session already exists for this batch and date.",

  PRACTICE_NOT_STARTED: "Practice is not started yet.",
  FEATURE_NOT_ASSIGNED: "This feature is not enabled for your student account. Ask your center to assign it first.",
  PRACTICE_CLOSED: "Practice window is closed.",
  ENROLLMENT_WINDOW_CLOSED: "Enrollment is closed for this exam cycle.",
  EXAM_NOT_LIVE: "Exam is not live yet.",
  EXAM_WINDOW_CLOSED: "Exam window is closed.",
  EXAM_DEVICE_LOCKED: "This exam attempt is locked to another device/session.",
  EXAM_CYCLE_NOT_FOUND: "This exam cycle was not found. Refresh and try again.",
  EXAM_CODE_CONFLICT: "Could not generate a unique exam code. Please try again.",
  EXAM_LIST_EMPTY: "This enrollment list has no students yet.",
  EXAM_LIST_ITEM_NOT_FOUND: "That entry is no longer in the combined list. Refresh and try again.",
  EXAM_LIST_NOT_FOUND: "This enrollment list was not found. Refresh and try again.",
  EXAM_LIST_TYPE_CONFLICT: "This action is not allowed for the current list type.",
  EXAM_WORKSHEET_SELECTION_REQUIRED: "Select exam worksheets before approving this list.",
  EXAM_WORKSHEET_SELECTION_MISSING: "No exam worksheet selection was saved for this request.",
  EXAM_WORKSHEET_SELECTION_INCOMPLETE: "Select an exam worksheet for every requested level before approving.",
  EXAM_WORKSHEET_SELECTION_LEVEL_INVALID: "One or more worksheet selections reference an invalid level.",
  EXAM_WORKSHEET_NOT_FOUND: "A selected exam worksheet was not found.",
  EXAM_WORKSHEET_LEVEL_MISMATCH: "A selected exam worksheet does not match the requested level.",
  EXAM_WORKSHEET_SOURCE_INVALID: "Select a base worksheet, not an exam-cycle worksheet.",
  EXAM_WORKSHEET_NOT_PUBLISHED: "Selected exam worksheets must be published before approval.",
  EXAM_WORKSHEET_QUESTIONS_MISSING: "A selected exam worksheet has no questions.",
  ENROLLMENT_EXISTS: "This student is already enrolled in this batch.",
  TEACHER_HAS_ACTIVE_STUDENTS: "Cannot suspend teacher while active assigned students exist. Shift or unassign them first.",
  INVALID_TARGET_TEACHER: "Please choose an active teacher from the same center.",
  TEACHER_STUDENT_FORBIDDEN: "One or more selected students are not assigned to this teacher.",
  CENTER_SCOPE_REQUIRED: "Your account is missing a center scope for this action.",
  DUPLICATE_ENROLLMENT: "One or more selected students are already enrolled in this exam cycle.",
  HIERARCHY_SCOPE_DENIED: "You do not have access to this exam-cycle data.",
  WORKFLOW_ROLE_FORBIDDEN: "Your role cannot perform this exam workflow action.",
  REJECT_REMARK_REQUIRED: "Please provide a remark before rejecting this enrollment list.",
  RESULTS_NOT_PUBLISHED: "Results are not published yet for this exam cycle."
  ,DUPLICATE_PENDING: "A reassignment request is already pending for this worksheet."
  ,NO_SUBMISSION: "You can request reassignment only after submitting this worksheet."
  ,SWAP_WORKSHEET_REQUIRED: "Please choose a replacement worksheet for a swap request."
  ,NEW_WORKSHEET_NOT_FOUND: "The selected replacement worksheet was not found."
  ,COURSE_DELETE_BLOCKED: "This course cannot be deleted while it is linked to partner access or student records. Remove those links first."
};

function getApiErrorCode(error) {
  return error?.response?.data?.error_code || null;
}

function getFriendlyErrorMessage(error) {
  const code = getApiErrorCode(error);
  if (code && FRIENDLY_BY_CODE[code]) {
    return FRIENDLY_BY_CODE[code];
  }

  const isNetworkDown =
    !error?.response &&
    (error?.code === "ERR_NETWORK" || String(error?.message || "").toLowerCase().includes("network error"));
  if (isNetworkDown) {
    return "Cannot reach the server. Please ensure backend is running and try again.";
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
  const isNetworkDown =
    !error?.response &&
    (error?.code === "ERR_NETWORK" || String(error?.message || "").toLowerCase().includes("network error"));
  const isStudentDuplicateConflict =
    status === 409 &&
    method === "post" &&
    (path === "/students" || (typeof path === "string" && /\/students\/[^/]+\/create-login$/.test(path))) &&
    (code === "AUTH_EMAIL_EXISTS" || code === "AUTH_USERNAME_EXISTS" || code === "STUDENT_EMAIL_EXISTS");

  // Some 409s are expected control flow (e.g. "create" when record already exists).
  // Avoid polluting the console with noise for these cases.
  if (
    isNetworkDown ||
    (code === "SESSION_ALREADY_EXISTS" && method === "post" && path === "/teacher/attendance/sessions") ||
    (code === "DUPLICATE_PENDING" && method === "post" && path === "/student/reassignment-requests") ||
    (code === "FEATURE_NOT_ASSIGNED" && method === "get" && path === "/student/practice-worksheets/options") ||
    (code === "FEATURE_NOT_ASSIGNED" && method === "get" && path === "/student/abacus-practice-worksheets/options") ||
    isStudentDuplicateConflict
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
