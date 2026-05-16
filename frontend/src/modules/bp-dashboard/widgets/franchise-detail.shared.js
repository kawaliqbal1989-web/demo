import { centerOptionMatchesItem } from "../utils/filters";
import { getHealthTone, round, toNumber } from "../utils/formatters";

const ALL_CENTERS_RESOURCE_STATE = Object.freeze({
  limit: 100,
  offset: 0,
  sortBy: "healthScore",
  sortDirection: "desc"
});

const DEFAULT_CENTER_TABLE_STATE = Object.freeze({
  limit: 8,
  offset: 0,
  query: "",
  sortBy: "healthScore",
  sortDirection: "desc",
  statusFilter: ""
});

const CENTER_STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Stable", value: "stable" },
  { label: "Healthy", value: "healthy" },
  { label: "Watch", value: "watch" },
  { label: "At risk", value: "at-risk" }
];

function nextSortState(current, sortBy) {
  if (current.sortBy !== sortBy) {
    return { ...current, offset: 0, sortBy, sortDirection: "desc" };
  }

  return {
    ...current,
    offset: 0,
    sortDirection: current.sortDirection === "desc" ? "asc" : "desc"
  };
}

function compareCenterValues(left, right, sortBy) {
  const leftValue = left?.[sortBy];
  const rightValue = right?.[sortBy];

  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue || "").localeCompare(String(rightValue || ""));
  }

  return toNumber(leftValue) - toNumber(rightValue);
}

function sortCenterRows(items = [], tableState = {}) {
  const sortBy = tableState.sortBy || "healthScore";
  const direction = tableState.sortDirection === "asc" ? "asc" : "desc";

  return [...items].sort((left, right) => {
    const comparison = compareCenterValues(left, right, sortBy);
    if (comparison !== 0) {
      return direction === "asc" ? comparison : comparison * -1;
    }

    return String(left?.centerName || "").localeCompare(String(right?.centerName || ""));
  });
}

function getCenterOperationalStatus(item) {
  const tone = getHealthTone(item?.healthScore);
  const attendancePercent = toNumber(item?.attendancePercent);
  const monthlyRevenue = toNumber(item?.monthlyRevenue);
  const pendingFees = toNumber(item?.pendingFees);
  const growthPercent = toNumber(item?.studentGrowthPercent);

  if (tone === "risk" || attendancePercent < 60 || growthPercent < -5 || pendingFees > monthlyRevenue) {
    return {
      label: "At risk",
      tone: "risk"
    };
  }

  if (tone === "watch" || attendancePercent < 75 || growthPercent < 0) {
    return {
      label: "Watch",
      tone: "watch"
    };
  }

  if (tone === "good") {
    return {
      label: "Healthy",
      tone: "good"
    };
  }

  return {
    label: "Stable",
    tone: "excellent"
  };
}

function filterCenterRows(items = [], { query = "", selectedCenterOption = null, statusFilter = "" } = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();

  return items.filter((item) => {
    if (selectedCenterOption && !centerOptionMatchesItem(selectedCenterOption, item)) {
      return false;
    }

    if (statusFilter) {
      const status = getCenterOperationalStatus(item);
      if (status.label.toLowerCase().replace(/\s+/g, "-") !== statusFilter) {
        return false;
      }
    }

    if (!normalizedQuery) {
      return true;
    }

    return [item?.centerName, item?.centerCode, item?.franchiseName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedQuery));
  });
}

function paginateCenterRows(items = [], pagination = {}) {
  const limit = Math.max(1, Number.parseInt(pagination.limit, 10) || DEFAULT_CENTER_TABLE_STATE.limit);
  const offset = Math.max(0, Number.parseInt(pagination.offset, 10) || 0);
  const pagedItems = items.slice(offset, offset + limit);

  return {
    items: pagedItems,
    pagination: {
      limit,
      offset,
      returned: pagedItems.length,
      total: items.length
    }
  };
}

function formatAlertType(type) {
  return String(type || "Operational alert")
    .toLowerCase()
    .split("_")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function getAlertSeverityTone(severity) {
  const normalized = String(severity || "medium").toLowerCase();
  if (["critical", "high", "medium", "low"].includes(normalized)) {
    return normalized;
  }

  return "medium";
}

function getAverageAttendance(items = []) {
  if (!items.length) {
    return null;
  }

  const total = items.reduce((sum, item) => sum + toNumber(item?.attendancePercent), 0);
  return round(total / items.length, 1);
}

function getLoadedCenterCoverage(items = [], pagination = {}) {
  const loadedCount = items.length;
  const totalCount = Number.isInteger(pagination?.total) ? pagination.total : loadedCount;
  return `${loadedCount}/${totalCount}`;
}

export {
  ALL_CENTERS_RESOURCE_STATE,
  CENTER_STATUS_OPTIONS,
  DEFAULT_CENTER_TABLE_STATE,
  filterCenterRows,
  formatAlertType,
  getAlertSeverityTone,
  getAverageAttendance,
  getCenterOperationalStatus,
  getLoadedCenterCoverage,
  nextSortState,
  paginateCenterRows,
  sortCenterRows
};