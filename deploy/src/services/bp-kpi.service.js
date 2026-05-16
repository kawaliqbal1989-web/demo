import { calculateBusinessPartnerHealthScore } from "./health-score.service.js";

function toNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMetric(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, roundMetric(value, 2)));
}

function calculateDelta(currentValue, previousValue) {
  return roundMetric(toNumber(currentValue) - toNumber(previousValue), 2);
}

function calculateDeltaPercent(currentValue, previousValue) {
  const current = toNumber(currentValue);
  const previous = toNumber(previousValue);

  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return roundMetric(((current - previous) / Math.abs(previous)) * 100, 2);
}

function average(values = []) {
  const normalized = values.map((value) => toNumber(value));
  if (!normalized.length) {
    return 0;
  }

  return roundMetric(normalized.reduce((sum, value) => sum + value, 0) / normalized.length, 2);
}

function weightedAverage(entries = []) {
  const normalized = entries
    .map((entry) => ({
      value: toNumber(entry?.value),
      weight: Math.max(0, toNumber(entry?.weight))
    }))
    .filter((entry) => entry.weight > 0);

  if (!normalized.length) {
    return 0;
  }

  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  const totalValue = normalized.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  return roundMetric(totalValue / totalWeight, 2);
}

function normalizeGrowthScore(value) {
  return clampPercent(50 + toNumber(value));
}

function computeHealthScore({ attendancePercent = 0, retentionPercent = 0, collectionRatio = 0, growthPercent = 0 } = {}) {
  const result = calculateBusinessPartnerHealthScore({
    attendancePercent,
    retentionPercent,
    collectionPercent: collectionRatio,
    studentGrowthPercent: growthPercent,
    activeStudentRatio: retentionPercent
  });

  return roundMetric(result.score, 2);
}

function buildComparisonMetric({ key, label, currentValue, previousValue = 0, unit = "count", precision = 2 }) {
  const value = roundMetric(currentValue, precision);
  const previous = roundMetric(previousValue, precision);

  return {
    key,
    label,
    unit,
    value,
    previousValue: previous,
    delta: roundMetric(calculateDelta(value, previous), precision),
    deltaPercent: calculateDeltaPercent(value, previous)
  };
}

export {
  average,
  buildComparisonMetric,
  calculateDeltaPercent,
  clampPercent,
  computeHealthScore,
  roundMetric,
  toNumber,
  weightedAverage
};