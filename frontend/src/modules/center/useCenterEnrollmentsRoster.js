import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listEnrollments } from "../../services/enrollmentsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { useDebouncedValue } from "./batches/useDebouncedValue";

function writeParams(searchParams, patch) {
  const nextParams = new URLSearchParams(searchParams);

  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      nextParams.delete(key);
      return;
    }

    nextParams.set(key, String(value));
  });

  return nextParams;
}

function buildRosterSummary(rows) {
  const summary = {
    totalEnrollments: rows.length,
    matchedStudents: rows.length,
    loadedRows: rows.length,
    activeStudents: 0,
    inactiveStudents: 0,
    paidStudents: 0,
    pendingStudents: 0,
    overdueStudents: 0,
    notSetStudents: 0,
    pendingInstallments: 0,
    overdueInstallments: 0,
    pendingFeeAmount: 0,
    unassignedTeachers: 0
  };

  for (const row of rows) {
    const student = row?.student || {};
    const feeStatus = String(student.feeStatus || "").toUpperCase();
    const pendingInstallmentsCount = Number(student.pendingInstallmentsCount || 0);
    const overdueInstallmentsCount = Number(student.overdueInstallmentsCount || 0);
    const pendingFeeAmount = Number(student.pendingFeeAmount || 0);

    if (student.isActive) {
      summary.activeStudents += 1;
    } else {
      summary.inactiveStudents += 1;
    }

    if (feeStatus === "PAID") summary.paidStudents += 1;
    if (feeStatus === "PENDING") summary.pendingStudents += 1;
    if (feeStatus === "OVERDUE") summary.overdueStudents += 1;
    if (feeStatus === "NOT_SET") summary.notSetStudents += 1;

    summary.pendingInstallments += pendingInstallmentsCount;
    summary.overdueInstallments += overdueInstallmentsCount;
    summary.pendingFeeAmount += pendingFeeAmount;

    if (!row.assignedTeacher) {
      summary.unassignedTeachers += 1;
    }
  }

  summary.pendingFeeAmount = Math.round(summary.pendingFeeAmount * 100) / 100;
  return summary;
}

function useCenterEnrollmentsRoster({ pageSize = 100 } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [batchId, setBatchId] = useState(() => searchParams.get("batchId") || "");
  const [rows, setRows] = useState([]);
  const [rosterSummary, setRosterSummary] = useState(() => buildRosterSummary([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rosterPage, setRosterPage] = useState(() => Math.max(0, Number(searchParams.get("page") || 0)));
  const [rosterTotal, setRosterTotal] = useState(0);
  const [rosterQuery, setRosterQuery] = useState(() => searchParams.get("q") || "");
  const [rosterTeacherUserId, setRosterTeacherUserId] = useState(() => searchParams.get("teacherUserId") || "");
  const [rosterLevelId, setRosterLevelId] = useState(() => searchParams.get("levelId") || "");
  const [rosterStatus, setRosterStatus] = useState(() => searchParams.get("status") || "ACTIVE");
  const [rosterStudentActive, setRosterStudentActive] = useState(() => searchParams.get("studentActive") || "");
  const [rosterFrom, setRosterFrom] = useState(() => searchParams.get("from") || "");
  const [rosterTo, setRosterTo] = useState(() => searchParams.get("to") || "");
  const [rosterFeeStatus, setRosterFeeStatus] = useState(() => searchParams.get("feeStatus") || "");
  const [rosterPendingInstallments, setRosterPendingInstallments] = useState(() => searchParams.get("pendingInstallments") || "");
  const debouncedRosterQuery = useDebouncedValue(rosterQuery.trim(), 350);
  const didInitRosterSearch = useRef(false);

  const rosterFilters = useMemo(
    () => ({
      q: rosterQuery.trim(),
      teacherUserId: rosterTeacherUserId,
      levelId: rosterLevelId,
      status: rosterStatus,
      studentActive: rosterStudentActive,
      from: rosterFrom,
      to: rosterTo,
      feeStatus: rosterFeeStatus,
      pendingInstallments: rosterPendingInstallments
    }),
    [rosterFeeStatus, rosterFrom, rosterLevelId, rosterPendingInstallments, rosterQuery, rosterStatus, rosterStudentActive, rosterTeacherUserId, rosterTo]
  );
  const loadEnrollments = async (nextBatchId, page = 0, overrides = {}) => {
    const id = nextBatchId || batchId;
    if (!id) {
      setRows([]);
      setRosterTotal(0);
      setRosterPage(0);
      setRosterSummary(buildRosterSummary([]));
      return;
    }

    const filters = {
      ...rosterFilters,
      ...overrides,
      q: overrides.q ?? rosterFilters.q
    };

    setLoading(true);
    setError("");
    try {
      const data = await listEnrollments({
        limit: pageSize,
        offset: page * pageSize,
        batchId: id,
        status: filters.status,
        q: filters.q,
        teacherUserId: filters.teacherUserId,
        levelId: filters.levelId,
        studentActive: filters.studentActive,
        from: filters.from,
        to: filters.to,
        feeStatus: filters.feeStatus,
        pendingInstallments: filters.pendingInstallments
      });
      const nextRows = data.data?.items || [];
      const apiSummary = data.data?.summary || {};
      const fallbackSummary = buildRosterSummary(nextRows);
      setRows(nextRows);
      setRosterTotal(data.data?.total ?? 0);
      setRosterPage(page);
      setRosterSummary({
        ...fallbackSummary,
        totalEnrollments: Number(apiSummary.totalEnrollments ?? data.data?.total ?? fallbackSummary.totalEnrollments),
        matchedStudents: Number(apiSummary.matchedStudents ?? fallbackSummary.matchedStudents),
        activeStudents: Number(apiSummary.activeStudents ?? fallbackSummary.activeStudents),
        inactiveStudents: Number(apiSummary.inactiveStudents ?? fallbackSummary.inactiveStudents),
        paidStudents: Number(apiSummary.paidStudents ?? fallbackSummary.paidStudents),
        pendingStudents: Number(apiSummary.pendingStudents ?? fallbackSummary.pendingStudents),
        overdueStudents: Number(apiSummary.overdueStudents ?? fallbackSummary.overdueStudents),
        notSetStudents: Number(apiSummary.notSetStudents ?? fallbackSummary.notSetStudents),
        pendingInstallments: Number(apiSummary.pendingInstallments ?? fallbackSummary.pendingInstallments),
        overdueInstallments: Number(apiSummary.overdueInstallments ?? fallbackSummary.overdueInstallments),
        pendingFeeAmount: Number(apiSummary.pendingFeeAmount ?? fallbackSummary.pendingFeeAmount),
        loadedRows: nextRows.length
      });
      setSearchParams(
        writeParams(searchParams, {
          batchId: id,
          page,
          q: filters.q,
          teacherUserId: filters.teacherUserId,
          levelId: filters.levelId,
          status: filters.status,
          studentActive: filters.studentActive,
          from: filters.from,
          to: filters.to,
          feeStatus: filters.feeStatus,
          pendingInstallments: filters.pendingInstallments
        }),
        { replace: true }
      );
    } catch (nextError) {
      setError(getFriendlyErrorMessage(nextError) || "Failed to load enrollments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!didInitRosterSearch.current) {
      didInitRosterSearch.current = true;
      return;
    }

    if (!batchId) {
      return;
    }

    setRosterPage(0);
    void loadEnrollments(batchId, 0, { q: debouncedRosterQuery });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedRosterQuery]);

  const clearRosterFilters = async () => {
    setRosterQuery("");
    setRosterTeacherUserId("");
    setRosterLevelId("");
    setRosterStatus("ACTIVE");
    setRosterStudentActive("");
    setRosterFrom("");
    setRosterTo("");
    setRosterFeeStatus("");
    setRosterPendingInstallments("");

    await loadEnrollments(batchId, 0, {
      q: "",
      teacherUserId: "",
      levelId: "",
      status: "ACTIVE",
      studentActive: "",
      from: "",
      to: "",
      feeStatus: "",
      pendingInstallments: ""
    });
  };

  return {
    batchId,
    setBatchId,
    rows,
    loading,
    error,
    setError,
    rosterPage,
    setRosterPage,
    rosterTotal,
    rosterQuery,
    setRosterQuery,
    rosterTeacherUserId,
    setRosterTeacherUserId,
    rosterLevelId,
    setRosterLevelId,
    rosterStatus,
    setRosterStatus,
    rosterStudentActive,
    setRosterStudentActive,
    rosterFrom,
    setRosterFrom,
    rosterTo,
    setRosterTo,
    rosterFeeStatus,
    setRosterFeeStatus,
    rosterPendingInstallments,
    setRosterPendingInstallments,
    rosterFilters,
    rosterSummary,
    loadEnrollments,
    clearRosterFilters,
    pageSize
  };
}

export { useCenterEnrollmentsRoster };