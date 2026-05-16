import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listBatches } from "../../../services/batchesService";
import { listLevels } from "../../../services/levelsService";
import { listTeachers } from "../../../services/teachersService";
import { getFriendlyErrorMessage } from "../../../utils/apiErrors";
import { PAGE_SIZE_OPTIONS } from "./batchCatalog.constants";
import { extractApiItems, extractApiMeta, getTeacherName } from "./batchCatalog.helpers";
import { useDebouncedValue } from "./useDebouncedValue";

function readBooleanParam(searchParams, key) {
  return searchParams.get(key) === "1";
}

function readStringArray(searchParams, key) {
  return String(searchParams.get(key) || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function writeParams(searchParams, patch, { resetPage = false } = {}) {
  const nextParams = new URLSearchParams(searchParams);

  Object.entries(patch).forEach(([key, value]) => {
    if (
      value === undefined
      || value === null
      || value === ""
      || (Array.isArray(value) && value.length === 0)
      || value === false
    ) {
      nextParams.delete(key);
      return;
    }

    if (Array.isArray(value)) {
      nextParams.set(key, value.join(","));
      return;
    }

    nextParams.set(key, String(value));
  });

  if (resetPage) {
    nextParams.delete("page");
  }

  return nextParams;
}

function useBatchCatalog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") || "");
  const [catalogState, setCatalogState] = useState({ items: [], total: 0, loading: true, refreshing: false, error: "" });
  const [lookupState, setLookupState] = useState({ teachers: [], levels: [], loading: true, error: "" });
  const [refreshNonce, setRefreshNonce] = useState(0);
  const debouncedSearch = useDebouncedValue(searchInput, 350);

  const query = useMemo(() => {
    const rawPageSize = Number(searchParams.get("pageSize") || 20);
    const pageSize = PAGE_SIZE_OPTIONS.includes(rawPageSize) ? rawPageSize : 20;
    const page = Math.max(1, Number(searchParams.get("page") || 1));

    return {
      q: searchParams.get("q") || "",
      page,
      pageSize,
      teacherId: searchParams.get("teacherId") || "",
      levelId: searchParams.get("levelId") || "",
      modality: searchParams.get("modality") || "",
      statuses: readStringArray(searchParams, "statuses"),
      dayType: searchParams.get("dayType") || "",
      includeArchived: readBooleanParam(searchParams, "archived"),
      fullOnly: readBooleanParam(searchParams, "fullOnly"),
      compact: readBooleanParam(searchParams, "compact"),
      sortBy: searchParams.get("sortBy") || "createdAt",
      sortDir: searchParams.get("sortDir") || "desc"
    };
  }, [searchParams]);

  useEffect(() => {
    setSearchInput(query.q);
  }, [query.q]);

  useEffect(() => {
    if (debouncedSearch === query.q) {
      return;
    }

    setSearchParams(writeParams(searchParams, { q: debouncedSearch || null }, { resetPage: true }), { replace: true });
  }, [debouncedSearch, query.q, searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadLookups() {
      setLookupState((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [teachersResponse, levelsResponse] = await Promise.all([
          listTeachers({ limit: 300, offset: 0 }),
          listLevels()
        ]);

        if (cancelled) return;

        const teachers = extractApiItems(teachersResponse)
          .filter((teacher) => teacher?.role === "TEACHER")
          .map((teacher) => ({
            id: teacher.id,
            label: getTeacherName(teacher),
            email: teacher.email || "",
            data: teacher
          }))
          .sort((left, right) => left.label.localeCompare(right.label));

        const levels = extractApiItems(levelsResponse)
          .map((level) => ({
            id: level.id,
            label: level.name || level.code || "Level",
            rank: level.rank ?? null,
            data: level
          }))
          .sort((left, right) => (Number(left.rank || 999) - Number(right.rank || 999)) || left.label.localeCompare(right.label));

        setLookupState({ teachers, levels, loading: false, error: "" });
      } catch (error) {
        if (cancelled) return;
        setLookupState({ teachers: [], levels: [], loading: false, error: getFriendlyErrorMessage(error) || "Failed to load filters." });
      }
    }

    void loadLookups();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      setCatalogState((current) => ({
        ...current,
        loading: current.items.length === 0,
        refreshing: current.items.length > 0,
        error: ""
      }));

      try {
        const response = await listBatches({
          page: query.page,
          pageSize: query.pageSize,
          q: query.q,
          statuses: query.statuses,
          teacherId: query.teacherId,
          levelId: query.levelId,
          modality: query.modality,
          dayType: query.dayType || undefined,
          includeArchived: query.includeArchived,
          fullOnly: query.fullOnly,
          sortBy: query.sortBy,
          sortDir: query.sortDir
        });

        if (cancelled) return;

        const meta = extractApiMeta(response);
        setCatalogState({
          items: extractApiItems(response),
          total: meta.total,
          loading: false,
          refreshing: false,
          error: ""
        });
      } catch (error) {
        if (cancelled) return;
        setCatalogState((current) => ({
          ...current,
          loading: false,
          refreshing: false,
          error: getFriendlyErrorMessage(error) || "Failed to load batches."
        }));
      }
    }

    void loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [
    query.dayType,
    query.fullOnly,
    query.includeArchived,
    query.levelId,
    query.modality,
    query.page,
    query.pageSize,
    query.q,
    query.sortBy,
    query.sortDir,
    query.statuses,
    query.teacherId,
    refreshNonce
  ]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (query.teacherId) count += 1;
    if (query.levelId) count += 1;
    if (query.modality) count += 1;
    if (query.statuses.length) count += query.statuses.length;
    if (query.dayType) count += 1;
    if (query.includeArchived) count += 1;
    if (query.fullOnly) count += 1;
    return count;
  }, [query.dayType, query.fullOnly, query.includeArchived, query.levelId, query.modality, query.statuses, query.teacherId]);

  function updateQuery(patch, options = {}) {
    setSearchParams(writeParams(searchParams, patch, options), { replace: true });
  }

  function toggleStatus(status) {
    const nextStatuses = query.statuses.includes(status)
      ? query.statuses.filter((item) => item !== status)
      : [...query.statuses, status];
    updateQuery({ statuses: nextStatuses }, { resetPage: true });
  }

  function setPage(page) {
    updateQuery({ page: Math.max(1, page) }, { resetPage: false });
  }

  function setPageSize(pageSize) {
    updateQuery({ pageSize }, { resetPage: true });
  }

  function setSort(sortKey) {
    const nextSortDir = query.sortBy === sortKey && query.sortDir === "asc" ? "desc" : "asc";
    updateQuery({ sortBy: sortKey, sortDir: nextSortDir }, { resetPage: false });
  }

  function clearFilters() {
    setSearchInput("");
    updateQuery({
      q: null,
      teacherId: null,
      levelId: null,
      modality: null,
      statuses: [],
      dayType: null,
      archived: null,
      fullOnly: null,
      page: null
    }, { resetPage: true });
  }

  function refresh() {
    setRefreshNonce((value) => value + 1);
  }

  return {
    query,
    searchInput,
    setSearchInput,
    items: catalogState.items,
    total: catalogState.total,
    loading: catalogState.loading,
    refreshing: catalogState.refreshing,
    error: catalogState.error,
    teachers: lookupState.teachers,
    levels: lookupState.levels,
    lookupsLoading: lookupState.loading,
    lookupError: lookupState.error,
    activeFilterCount,
    updateQuery,
    toggleStatus,
    setPage,
    setPageSize,
    setSort,
    clearFilters,
    refresh
  };
}

export { useBatchCatalog };