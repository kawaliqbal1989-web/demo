function toDateInputValue(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) {
    return toDateInputValue(new Date());
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const DEFAULT_TREND_MONTH_WINDOW = 6;
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_SORT_DIRECTION = "desc";

function normalizeOptionalString(value) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function normalizeTrendMonthsValue(months, fallback = DEFAULT_TREND_MONTH_WINDOW) {
  return normalizeInteger(months, fallback, { min: 1, max: 12 });
}

function normalizePaginationInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < min || parsed > max) {
    return fallback;
  }

  return parsed;
}

function normalizePaginationParams(
  pagination = {},
  { defaultLimit = DEFAULT_PAGE_LIMIT, defaultOffset = 0, maxLimit = MAX_PAGE_LIMIT } = {}
) {
  const limit = normalizePaginationInteger(pagination.limit, defaultLimit, {
    min: 1,
    max: maxLimit
  });
  const offset = normalizePaginationInteger(pagination.offset, defaultOffset, {
    min: 0
  });

  return {
    limit,
    offset
  };
}

function normalizeSortDirection(direction, fallback = DEFAULT_SORT_DIRECTION) {
  return direction === "asc" || direction === "desc" ? direction : fallback;
}

function normalizeFilterValue(value) {
  if (Array.isArray(value)) {
    const normalizedItems = value
      .map((item) => normalizeFilterValue(item))
      .filter((item) => item !== undefined);

    return normalizedItems.length ? normalizedItems : undefined;
  }

  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value && typeof value === "object") {
    const normalizedEntries = Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        const normalizedValue = normalizeFilterValue(value[key]);
        if (normalizedValue !== undefined) {
          accumulator[key] = normalizedValue;
        }
        return accumulator;
      }, {});

    return Object.keys(normalizedEntries).length ? normalizedEntries : undefined;
  }

  return undefined;
}

function normalizeFranchiseQueryFilters(filters = {}) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
    return {};
  }

  return Object.keys(filters)
    .sort()
    .reduce((accumulator, key) => {
      const normalizedValue = normalizeFilterValue(filters[key]);
      if (normalizedValue !== undefined) {
        accumulator[key] = normalizedValue;
      }
      return accumulator;
    }, {});
}

function addMonths(dateValue, months) {
  const parsed = new Date(dateValue);
  parsed.setMonth(parsed.getMonth() + months);
  return parsed;
}

function getDefaultDateRange() {
  const dateTo = toDateInputValue(new Date());
  const dateFrom = toDateInputValue(addMonths(new Date(), -5));
  return {
    dateFrom,
    dateTo,
    franchiseId: "",
    centerId: ""
  };
}

function normalizeDashboardFilters(filters = {}) {
  const defaults = getDefaultDateRange();
  const normalized = {
    dateFrom: filters.dateFrom || defaults.dateFrom,
    dateTo: filters.dateTo || defaults.dateTo,
    franchiseId: filters.franchiseId || "",
    centerId: filters.centerId || ""
  };

  if (normalized.dateFrom > normalized.dateTo) {
    return {
      ...normalized,
      dateFrom: normalized.dateTo
    };
  }

  return normalized;
}

function parseDashboardSearchParams(searchParams) {
  return normalizeDashboardFilters({
    dateFrom: searchParams.get("from") || "",
    dateTo: searchParams.get("to") || "",
    franchiseId: searchParams.get("franchiseId") || "",
    centerId: searchParams.get("centerId") || ""
  });
}

function buildDashboardSearchParams(filters = {}) {
  const normalized = normalizeDashboardFilters(filters);
  const params = new URLSearchParams();
  params.set("from", normalized.dateFrom);
  params.set("to", normalized.dateTo);

  if (normalized.franchiseId) {
    params.set("franchiseId", normalized.franchiseId);
  }

  if (normalized.centerId) {
    params.set("centerId", normalized.centerId);
  }

  return params;
}

function getTrendMonths(filters = {}) {
  const normalized = normalizeDashboardFilters(filters);
  const from = new Date(normalized.dateFrom);
  const to = new Date(normalized.dateTo);
  const yearDiff = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  const resolved = yearDiff * 12 + monthDiff + 1;
  return Math.max(1, Math.min(12, resolved || 1));
}

function filterCenterOptionsByFranchise(centerOptions = [], franchiseNodeId = null) {
  if (!franchiseNodeId) {
    return centerOptions;
  }

  return centerOptions.filter((option) => option.parentNodeId === franchiseNodeId);
}

function centerOptionMatchesItem(option, item) {
  if (!option || !item) {
    return false;
  }

  return (option.code && option.code === item.centerCode) || option.label === item.centerName;
}

function normalizeFranchiseAnalyticsParams(
  params = {},
  {
    includeAsOf = true,
    includeMonths = false,
    includePagination = false,
    includeSorting = false,
    includeFilters = false,
    defaultMonths = DEFAULT_TREND_MONTH_WINDOW,
    defaultLimit = DEFAULT_PAGE_LIMIT,
    defaultOffset = 0,
    defaultSortDirection = DEFAULT_SORT_DIRECTION
  } = {}
) {
  const normalized = {};

  if (includeAsOf) {
    const asOf = normalizeOptionalString(params.asOf);
    if (asOf) {
      normalized.asOf = asOf;
    }
  }

  if (includeMonths) {
    normalized.months = normalizeTrendMonthsValue(params.months, defaultMonths);
  }

  if (includePagination) {
    Object.assign(
      normalized,
      normalizePaginationParams(params, {
        defaultLimit,
        defaultOffset
      })
    );
  }

  if (includeSorting) {
    const sortBy = normalizeOptionalString(params.sortBy);
    if (sortBy) {
      normalized.sortBy = sortBy;
    }

    normalized.sortDirection = normalizeSortDirection(
      params.sortDirection || params.sortOrder,
      defaultSortDirection
    );
  }

  if (includeFilters) {
    Object.assign(normalized, normalizeFranchiseQueryFilters(params.filters));
  }

  return Object.entries(normalized).reduce((accumulator, [key, value]) => {
    if (value !== undefined) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

export {
  buildDashboardSearchParams,
  centerOptionMatchesItem,
  filterCenterOptionsByFranchise,
  getDefaultDateRange,
  getTrendMonths,
  normalizeFranchiseAnalyticsParams,
  normalizeFranchiseQueryFilters,
  normalizeDashboardFilters,
  normalizePaginationParams,
  normalizeSortDirection,
  normalizeTrendMonthsValue,
  parseDashboardSearchParams
};