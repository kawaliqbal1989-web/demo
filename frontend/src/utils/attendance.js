const ATTENDANCE_STATUS_COLORS = {
  PRESENT: { bg: "var(--color-bg-success-light)", fg: "var(--color-text-success)" },
  ABSENT: { bg: "var(--color-bg-danger-light)", fg: "var(--color-text-danger)" },
  LATE: { bg: "var(--color-bg-warn-light)", fg: "var(--color-text-warning)" },
  EXCUSED: { bg: "var(--color-bg-info-light)", fg: "var(--color-text-info)" }
};

function isAttendancePresentLike(status) {
  return status === "PRESENT" || status === "LATE";
}

function getAttendanceRate(summary = {}) {
  const total = Number(summary.total || 0);
  if (!total) return 0;
  const attended = Number(summary.PRESENT || 0) + Number(summary.LATE || 0);
  return Math.round((attended / total) * 100);
}

function getAttendanceStatusLabel(status) {
  const text = String(status || "").trim().toUpperCase();
  if (["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(text)) {
    return text;
  }
  return "UNKNOWN";
}

export {
  ATTENDANCE_STATUS_COLORS,
  isAttendancePresentLike,
  getAttendanceRate,
  getAttendanceStatusLabel
};