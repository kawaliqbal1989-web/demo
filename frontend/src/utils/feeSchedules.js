const FEE_SCHEDULE_OPTIONS = [
  { value: "ADVANCE", label: "ADVANCE" },
  { value: "MONTHLY", label: "MONTHLY" },
  { value: "QUARTERLY", label: "QUARTERLY" },
  { value: "HALF_YEARLY", label: "HALF_YEARLY" },
  { value: "YEARLY", label: "YEARLY" },
  { value: "LEVEL_WISE", label: "LEVEL_WISE" }
];

function formatFeeScheduleLabel(scheduleType, feeMonth, feeYear) {
  if (scheduleType === "MONTHLY") {
    return `MONTHLY ${feeMonth || ""}/${feeYear || ""}`.trim();
  }

  return scheduleType || "";
}

function formatFeeScheduleTarget(scheduleType, feeLevel, feeLevelId, feeMonth, feeYear) {
  if (scheduleType === "MONTHLY") {
    return `${feeMonth || ""}/${feeYear || ""}`;
  }

  if (scheduleType === "LEVEL_WISE") {
    return feeLevel ? `${feeLevel.name} / ${feeLevel.rank}` : feeLevelId || "";
  }

  if (scheduleType === "ADVANCE") {
    return "Whole";
  }

  return "";
}

export { FEE_SCHEDULE_OPTIONS, formatFeeScheduleLabel, formatFeeScheduleTarget };