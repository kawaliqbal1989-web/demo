const OPERATIONAL_CATEGORY_OPTIONS = [
  { value: "", label: "All Categories" },
  { value: "ACADEMIC", label: "Academic" },
  { value: "FINANCE", label: "Finance" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "RISK", label: "Risk" },
  { value: "SYSTEM", label: "System" },
  { value: "WORKFLOW", label: "Workflow" }
];

const OPERATIONAL_SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "CRITICAL", label: "Critical" },
  { value: "HIGH", label: "High" },
  { value: "WARNING", label: "Warning" },
  { value: "INFO", label: "Info" }
];

const OPERATIONAL_SEVERITY_ORDER = ["CRITICAL", "HIGH", "WARNING", "INFO"];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getOperationalLocationLabel(item) {
  if (item?.centerLabel && item?.franchiseLabel) {
    return `${item.centerLabel} · ${item.franchiseLabel}`;
  }

  if (item?.centerLabel) {
    return item.centerLabel;
  }

  if (item?.franchiseLabel) {
    return item.franchiseLabel;
  }

  return null;
}

function formatMetricValue(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return null;
  }

  const numericValue = Number(value);
  if (Math.abs(numericValue) >= 1000) {
    return numericValue.toLocaleString();
  }

  if (Number.isInteger(numericValue)) {
    return String(numericValue);
  }

  return numericValue.toFixed(2);
}

function getOperationalMetricSummary(item) {
  if (!item?.metricKey) {
    return null;
  }

  const observedValue = formatMetricValue(item.observedValue);
  const thresholdValue = formatMetricValue(item.thresholdValue);
  if (observedValue === null && thresholdValue === null) {
    return null;
  }

  return `${item.metricKey}${observedValue !== null ? ` ${observedValue}` : ""}${thresholdValue !== null ? ` / ${thresholdValue}` : ""}`;
}

function resolveOperationalDeepLink(item) {
  const rawPath = typeof item?.deepLinkPath === "string" ? item.deepLinkPath.trim() : "";
  if (rawPath) {
    if (/^\/bp\/franchises\/[^/]+$/i.test(rawPath)) {
      return rawPath;
    }

    if (/^\/bp\/(centers|ledger|settlements|revenue|revenue-split)(\/.*)?$/i.test(rawPath)) {
      const [, section] = rawPath.match(/^\/bp\/([^/]+)/i) || [];
      return section ? `/bp/${section}` : "/notifications";
    }
  }

  if (item?.franchiseId) {
    return `/bp/franchises/${item.franchiseId}`;
  }

  if (item?.centerId) {
    return "/bp/centers";
  }

  if (item?.category === "FINANCE") {
    return "/bp/ledger";
  }

  return "/notifications";
}

function groupOperationalNotifications(items = []) {
  const groups = new Map(OPERATIONAL_SEVERITY_ORDER.map((severity) => [severity, []]));

  for (const item of items) {
    const bucket = groups.get(item?.severity) || groups.get("INFO");
    bucket.push(item);
  }

  return OPERATIONAL_SEVERITY_ORDER
    .map((severity) => ({ severity, items: groups.get(severity) || [] }))
    .filter((group) => group.items.length > 0);
}

export {
  OPERATIONAL_CATEGORY_OPTIONS,
  OPERATIONAL_SEVERITY_OPTIONS,
  formatMetricValue,
  getOperationalLocationLabel,
  getOperationalMetricSummary,
  groupOperationalNotifications,
  resolveOperationalDeepLink,
  timeAgo
};