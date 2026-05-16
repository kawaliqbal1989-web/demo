const WARNING_THRESHOLD_PERCENT = 80;
const CRITICAL_THRESHOLD_PERCENT = 95;

const STATUS_PRIORITY = {
  unmanaged: 0,
  healthy: 1,
  warning: 2,
  critical: 3,
  locked: 4
};

function normalizePercent(value) {
  if (!Number.isFinite(Number(value))) {
    return null;
  }

  return Number(value);
}

function normalizeCount(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function isMetricConfigured(metric) {
  return Boolean(metric?.configured);
}

function isMetricLocked(metric) {
  if (!isMetricConfigured(metric)) {
    return false;
  }

  const limit = normalizeCount(metric?.limit);
  const used = normalizeCount(metric?.used);
  return used >= limit;
}

function deriveCapacityMetricStatus(metric) {
  if (!isMetricConfigured(metric)) {
    return {
      key: "unmanaged",
      label: "Unmanaged",
      tone: "neutral",
      utilizationPercent: null,
      limitReached: false
    };
  }

  const utilizationPercent = normalizePercent(metric?.utilizationPercent);
  const limitReached = isMetricLocked(metric) || metric?.state === "over";

  if (limitReached) {
    return {
      key: "locked",
      label: "Locked",
      tone: "danger",
      utilizationPercent,
      limitReached: true
    };
  }

  if (metric?.state === "critical" || (utilizationPercent ?? 0) >= CRITICAL_THRESHOLD_PERCENT) {
    return {
      key: "critical",
      label: "Critical",
      tone: "danger",
      utilizationPercent,
      limitReached: false
    };
  }

  if (metric?.state === "warning" || (utilizationPercent ?? 0) >= WARNING_THRESHOLD_PERCENT) {
    return {
      key: "warning",
      label: "Warning",
      tone: "warning",
      utilizationPercent,
      limitReached: false
    };
  }

  return {
    key: "healthy",
    label: "Healthy",
    tone: "success",
    utilizationPercent,
    limitReached: false
  };
}

function getCapacityMetric(snapshot, resourceType) {
  if (resourceType === "teachers") {
    return snapshot?.usage?.teachers || null;
  }

  return snapshot?.usage?.students || null;
}

function deriveCenterCapacityStatus(snapshot) {
  const studentStatus = deriveCapacityMetricStatus(getCapacityMetric(snapshot, "students"));
  const teacherStatus = deriveCapacityMetricStatus(getCapacityMetric(snapshot, "teachers"));

  return STATUS_PRIORITY[studentStatus.key] >= STATUS_PRIORITY[teacherStatus.key]
    ? studentStatus
    : teacherStatus;
}

function formatCapacityUsage(metric) {
  const used = normalizeCount(metric?.used);
  if (!isMetricConfigured(metric)) {
    return `${used} active`;
  }

  return `${used} / ${normalizeCount(metric?.limit)}`;
}

function formatRemainingSeats(metric) {
  if (!isMetricConfigured(metric)) {
    return "Unmanaged";
  }

  return `${Math.max(normalizeCount(metric?.remaining), 0)} remaining`;
}

function buildCapacityLimitMessage(metric, resourceLabel) {
  const status = deriveCapacityMetricStatus(metric);

  if (status.key === "locked") {
    return `${resourceLabel} capacity has been reached. Contact your BP or superadmin to request more seats.`;
  }

  if (status.key === "critical") {
    return `${resourceLabel} capacity is critically high. Plan an upgrade before new admissions or hires are blocked.`;
  }

  if (status.key === "warning") {
    return `${resourceLabel} capacity is nearing the configured limit.`;
  }

  if (status.key === "unmanaged") {
    return `${resourceLabel} capacity has not been configured yet.`;
  }

  return `${resourceLabel} capacity is healthy.`;
}

function shouldDisableCapacityAction(snapshot, resourceType) {
  const metric = getCapacityMetric(snapshot, resourceType);
  return isMetricLocked(metric);
}

export {
  CRITICAL_THRESHOLD_PERCENT,
  WARNING_THRESHOLD_PERCENT,
  buildCapacityLimitMessage,
  deriveCapacityMetricStatus,
  deriveCenterCapacityStatus,
  formatCapacityUsage,
  formatRemainingSeats,
  getCapacityMetric,
  shouldDisableCapacityAction
};