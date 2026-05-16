function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(toNumber(value));
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(toNumber(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(toNumber(value));
}

function formatPercent(value, { signed = false, digits = 1, fallback = "--" } = {}) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const normalized = round(value, digits).toFixed(digits);
  const prefix = signed && toNumber(value) > 0 ? "+" : "";
  return `${prefix}${normalized}%`;
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  return parsed.toLocaleString();
}

function formatMetricValue(metric) {
  if (!metric) {
    return "--";
  }

  if (metric.unit === "currency") {
    return formatCurrency(metric.value);
  }

  if (metric.unit === "percent") {
    return formatPercent(metric.value, { digits: 1 });
  }

  if (metric.unit === "score") {
    return String(round(metric.value, 1));
  }

  return formatCompactNumber(metric.value);
}

function formatMetricDelta(metric) {
  if (!metric) {
    return "No comparison available";
  }

  if (metric.unit === "currency") {
    return `${metric.delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(metric.delta))} vs prev`;
  }

  if (metric.unit === "percent") {
    return `${formatPercent(metric.delta, { signed: true, digits: 1 })} vs prev`;
  }

  return `${metric.delta >= 0 ? "+" : "-"}${formatNumber(Math.abs(metric.delta))} vs prev`;
}

function getHealthGrade(score) {
  const normalized = toNumber(score);
  if (normalized >= 85) {
    return "A";
  }
  if (normalized >= 70) {
    return "B";
  }
  if (normalized >= 55) {
    return "C";
  }
  return "D";
}

function getHealthTone(score) {
  const normalized = toNumber(score);
  if (normalized >= 85) {
    return "excellent";
  }
  if (normalized >= 70) {
    return "good";
  }
  if (normalized >= 55) {
    return "watch";
  }
  return "risk";
}

function formatChartCurrency(value) {
  const normalized = toNumber(value);
  if (Math.abs(normalized) >= 100000) {
    return formatCompactNumber(normalized);
  }

  return formatCurrency(normalized);
}

export {
  formatChartCurrency,
  formatCompactNumber,
  formatCurrency,
  formatDateTime,
  formatMetricDelta,
  formatMetricValue,
  formatNumber,
  formatPercent,
  getHealthGrade,
  getHealthTone,
  round,
  toNumber
};