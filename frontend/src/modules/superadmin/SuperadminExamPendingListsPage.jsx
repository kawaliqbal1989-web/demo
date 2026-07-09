import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import {
  approveEnrollmentListAsSuperadmin,
  exportEnrollmentListCsv,
  getEnrollmentListLevelBreakdown,
  getExamCycleAssessmentConfig,
  listExamCourses,
  listPendingEnrollmentLists,
  rejectPendingEnrollmentList,
  saveExamCycleAssessmentConfig
} from "../../services/examCyclesService";

function formatDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function SuperadminExamPendingListsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const examCourseContext = useMemo(() => {
    const routeStateContext = location.state?.examCycleContext || {};
    const stateCourseId = String(routeStateContext.examCourseId || routeStateContext.courseId || "").trim();
    const stateLevelNumber = String(routeStateContext.examLevelNumber || routeStateContext.levelNumber || "").trim();

    const queryCourseId = String(searchParams.get("examCourseId") || searchParams.get("courseId") || "").trim();
    const queryLevelNumber = String(searchParams.get("examLevelNumber") || searchParams.get("levelNumber") || "").trim();

    return {
      courseId: stateCourseId || queryCourseId || null,
      levelNumber: stateLevelNumber || queryLevelNumber || null
    };
  }, [location.state, searchParams]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [actingId, setActingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loadingApprovalId, setLoadingApprovalId] = useState(null);
  const [assessmentDataByListId, setAssessmentDataByListId] = useState({});
  const [draftConfigByListId, setDraftConfigByListId] = useState({});
  const [savingConfigListId, setSavingConfigListId] = useState(null);
  const [manualScopeByListId, setManualScopeByListId] = useState({});
  const [scopeOptionsByListId, setScopeOptionsByListId] = useState({});
  const [loadingScopeOptionsListId, setLoadingScopeOptionsListId] = useState(null);

  const [approveListId, setApproveListId] = useState(null);
  const [rejectListId, setRejectListId] = useState(null);

  const syncScopeToUrl = useCallback((courseId, levelNumber) => {
    if (!courseId) return;
    const next = new URLSearchParams(searchParams);
    next.set("examCourseId", String(courseId));
    if (levelNumber) {
      next.set("examLevelNumber", String(levelNumber));
    }
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPendingEnrollmentLists(examCycleId);
      const nextRows = Array.isArray(data?.data) ? data.data : [];
      setRows(nextRows);

      if (!examCourseContext.courseId || !examCourseContext.levelNumber) {
        const firstResolvedScope = nextRows.find((row) => row?.assessmentScope?.canConfigureAssessment);
        if (firstResolvedScope?.assessmentScope?.examCourseId && firstResolvedScope?.assessmentScope?.examLevelNumber) {
          const courseId = String(firstResolvedScope.assessmentScope.examCourseId);
          const levelNumber = String(firstResolvedScope.assessmentScope.examLevelNumber);
          setManualScopeByListId((prev) => ({
            ...prev,
            [firstResolvedScope.id]: { courseId, levelNumber }
          }));
          syncScopeToUrl(courseId, levelNumber);
        }
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load pending lists.");
    } finally {
      setLoading(false);
    }
  }, [examCycleId, examCourseContext.courseId, examCourseContext.levelNumber, syncScopeToUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const canAct = (listId) => actingId === null || actingId === listId;

  const getApiErrorCode = (err) => String(err?.response?.data?.errorCode || err?.errorCode || "").trim();

  const getEffectiveScopeForRow = useCallback((row, listId) => {
    const manual = manualScopeByListId[listId];
    if (manual?.courseId) {
      return {
        courseId: manual.courseId,
        levelNumber: manual?.levelNumber ? String(manual.levelNumber) : ""
      };
    }

    if (row?.assessmentScope?.canConfigureAssessment && row?.assessmentScope?.examCourseId) {
      return {
        courseId: String(row.assessmentScope.examCourseId),
        levelNumber: row?.assessmentScope?.examLevelNumber ? String(row.assessmentScope.examLevelNumber) : ""
      };
    }

    if (examCourseContext.courseId) {
      return {
        courseId: examCourseContext.courseId,
        levelNumber: examCourseContext.levelNumber ? String(examCourseContext.levelNumber) : ""
      };
    }

    return null;
  }, [examCourseContext.courseId, examCourseContext.levelNumber, manualScopeByListId]);

  const ensureScopeOptionsForList = useCallback(async (listRow) => {
    const listId = listRow?.id;
    if (!listId) return null;

    if (scopeOptionsByListId[listId]) {
      return scopeOptionsByListId[listId];
    }

    setLoadingScopeOptionsListId(listId);
    try {
      const [coursesResp, breakdownResp] = await Promise.all([
        listExamCourses(),
        getEnrollmentListLevelBreakdown(examCycleId, listId)
      ]);

      const rawCourses = Array.isArray(coursesResp?.data?.items) ? coursesResp.data.items : [];
      const levels = Array.isArray(breakdownResp?.data) ? breakdownResp.data : [];
      const allowedLevelNumbers = Array.from(
        new Set(levels.map((entry) => Number(entry?.levelRank)).filter((rank) => Number.isInteger(rank) && rank > 0))
      );

      const scopedCourses = rawCourses
        .map((course) => {
          const sourceLevels = Array.isArray(course?.levels) ? course.levels : [];
          const filteredLevels = allowedLevelNumbers.length
            ? sourceLevels.filter((level) => allowedLevelNumbers.includes(Number(level?.levelNumber)))
            : sourceLevels;

          return {
            ...course,
            levels: filteredLevels
          };
        })
        .filter((course) => Array.isArray(course.levels) && course.levels.length > 0);

      const options = {
        courses: scopedCourses,
        allowedLevelNumbers
      };

      setScopeOptionsByListId((prev) => ({
        ...prev,
        [listId]: options
      }));

      return options;
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load exam scope options.");
      return null;
    } finally {
      setLoadingScopeOptionsListId((prev) => (prev === listId ? null : prev));
    }
  }, [examCycleId, scopeOptionsByListId]);

  const setManualScope = useCallback((listId, patch) => {
    setManualScopeByListId((prev) => {
      const current = prev[listId] || {};
      return {
        ...prev,
        [listId]: {
          ...current,
          ...patch
        }
      };
    });
  }, []);

  const normalizeDraftConfig = useCallback((item = {}) => ({
    levelId: String(item.levelId || ""),
    assessmentType: String(item.assessmentType || "WORKSHEET"),
    worksheetId: item.worksheetId ? String(item.worksheetId) : "",
    questionBankId: item.questionBankId ? String(item.questionBankId) : "",
    questionCount: item.questionCount ?? "",
    timeLimitMinutes: item.timeLimitMinutes ?? ""
  }), []);

  const buildDraftFromAssessment = useCallback((assessmentPayload = {}) => {
    const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
    const existingConfigs = Array.isArray(assessmentPayload?.configs) ? assessmentPayload.configs : [];
    const configByLevelId = new Map(existingConfigs.map((config) => [config.levelId, config]));

    return levels
      .filter((level) => level?.canConfigureAssessment !== false)
      .map((level) => {
      const existing = configByLevelId.get(level.levelId);
      if (existing) {
        return normalizeDraftConfig(existing);
      }
      return normalizeDraftConfig({
        levelId: level.levelId,
        assessmentType: "WORKSHEET"
      });
      });
  }, [normalizeDraftConfig]);

  const getDraftValidation = useCallback((assessmentPayload = {}, draftConfig = []) => {
    const levels = Array.isArray(assessmentPayload?.levels) ? assessmentPayload.levels : [];
    const worksheetsByLevelId = assessmentPayload?.worksheetsByLevelId || {};
    const questionBanksByLevelId = assessmentPayload?.questionBanksByLevelId || {};
    const draftByLevelId = new Map((draftConfig || []).map((item) => [item.levelId, item]));

    const errorsByLevelId = {};
    let validCount = 0;

    for (const level of levels) {
      const current = draftByLevelId.get(level.levelId);
      const errors = [];
      const worksheetOptions = Array.isArray(worksheetsByLevelId[level.levelId]) ? worksheetsByLevelId[level.levelId] : [];
      const questionBankOptions = Array.isArray(questionBanksByLevelId[level.levelId]) ? questionBanksByLevelId[level.levelId] : [];

      if (level?.canConfigureAssessment === false) {
        errors.push(level?.scopeError || `Exam course Level ${String(level?.levelRank ?? "").trim() || "?"} is not configured.`);
        errorsByLevelId[level.levelId] = errors;
        continue;
      }

      if (!current) {
        errors.push("Missing configuration");
      } else if (current.assessmentType === "WORKSHEET") {
        if (!current.worksheetId) {
          errors.push("Select a worksheet");
        } else {
          const selectedWorksheet = worksheetOptions.find((worksheet) => worksheet.id === current.worksheetId);
          if (!selectedWorksheet) {
            errors.push("Selected worksheet is not available for this level");
          } else if (selectedWorksheet.isSelectable === false || selectedWorksheet.disabled) {
            errors.push(selectedWorksheet.unavailableReason || "Selected worksheet is not ready for approval");
          }
        }
      } else if (current.assessmentType === "QUESTION_BANK") {
        if (!current.questionBankId) {
          errors.push("Select a question bank");
        }

        const count = Number(current.questionCount);
        if (!Number.isInteger(count) || count <= 0) {
          errors.push("Question count must be a positive integer");
        }

        const limit = Number(current.timeLimitMinutes);
        if (!Number.isInteger(limit) || limit <= 0) {
          errors.push("Time limit must be a positive integer");
        }

        const selectedBank = questionBankOptions.find((bank) => bank.id === current.questionBankId);
        if (current.questionBankId && !selectedBank) {
          errors.push("Selected question bank is not available for this level");
        }
        if (selectedBank && Number.isInteger(count) && count > selectedBank.availableQuestionCount) {
          errors.push(`Question count cannot exceed ${selectedBank.availableQuestionCount}`);
        }
      } else {
        errors.push("Select assessment type");
      }

      if (current?.assessmentType === "WORKSHEET" && !worksheetOptions.length) {
        errors.push("No worksheet options available for this level");
      } else if (current?.assessmentType === "WORKSHEET" && !worksheetOptions.some((worksheet) => worksheet?.isSelectable !== false && !worksheet?.disabled)) {
        errors.push("No published worksheet options available for this level");
      }
      if (current?.assessmentType === "QUESTION_BANK" && !questionBankOptions.length) {
        errors.push("No active question bank options available for this level");
      }

      if (!errors.length) {
        validCount += 1;
      }

      errorsByLevelId[level.levelId] = errors;
    }

    return {
      errorsByLevelId,
      isComplete: levels.length > 0 && validCount === levels.length
    };
  }, []);

  const loadAssessmentOptions = useCallback(async (listId, scopeContext = null) => {
    const params = {
      listId,
      ...(scopeContext?.courseId ? { courseId: scopeContext.courseId } : {})
    };

    const resp = await getExamCycleAssessmentConfig(examCycleId, params);
    const payload = resp?.data || {};

    const levels = Array.isArray(payload?.levels) ? payload.levels : [];
    const configurableLevels = levels.filter((level) => level?.canConfigureAssessment && Number.isInteger(Number(level?.examLevelNumber)));

    const scopedResponses = await Promise.all(
      configurableLevels.map(async (level) => {
        try {
          const scopedResp = await getExamCycleAssessmentConfig(examCycleId, {
            listId,
            courseId: scopeContext?.courseId,
            levelNumber: level.examLevelNumber
          });
          return {
            levelId: level.levelId,
            data: scopedResp?.data || {}
          };
        } catch (_err) {
          return {
            levelId: level.levelId,
            data: null
          };
        }
      })
    );

    const mergedWorksheetsByLevelId = { ...(payload?.worksheetsByLevelId || {}) };
    const mergedQuestionBanksByLevelId = { ...(payload?.questionBanksByLevelId || {}) };

    for (const scopedEntry of scopedResponses) {
      if (!scopedEntry?.data) continue;
      const scopedLevelId = String(scopedEntry.levelId || "");
      const scopedWorksheets = scopedEntry?.data?.worksheetsByLevelId?.[scopedLevelId];
      const scopedQuestionBanks = scopedEntry?.data?.questionBanksByLevelId?.[scopedLevelId];

      if (Array.isArray(scopedWorksheets)) {
        mergedWorksheetsByLevelId[scopedLevelId] = scopedWorksheets;
      }

      if (Array.isArray(scopedQuestionBanks)) {
        mergedQuestionBanksByLevelId[scopedLevelId] = scopedQuestionBanks;
      }
    }

    const mergedPayload = {
      ...payload,
      worksheetsByLevelId: mergedWorksheetsByLevelId,
      questionBanksByLevelId: mergedQuestionBanksByLevelId
    };

    setAssessmentDataByListId((prev) => ({ ...prev, [listId]: mergedPayload }));
    setDraftConfigByListId((prev) => ({
      ...prev,
      [listId]: buildDraftFromAssessment(mergedPayload)
    }));
    return mergedPayload;
  }, [buildDraftFromAssessment, examCycleId]);

  const openApprovalForm = async (listId) => {
    if (!listId || !canAct(listId)) return;
    if (editingId === listId) {
      setEditingId(null);
      return;
    }

    const row = rows.find((entry) => entry?.id === listId) || null;
    const effectiveScope = getEffectiveScopeForRow(row, listId);

    setEditingId(listId);
    setError("");

    if (!assessmentDataByListId[listId]) {
      setLoadingApprovalId(listId);
      try {
        if (effectiveScope?.courseId) {
          await loadAssessmentOptions(listId, effectiveScope);
          syncScopeToUrl(effectiveScope.courseId, effectiveScope.levelNumber);
        } else {
          const options = await ensureScopeOptionsForList(row);
          const firstCourse = options?.courses?.[0] || null;
          const firstLevel = firstCourse?.levels?.[0] || null;
          if (firstCourse?.id && firstLevel?.levelNumber) {
            setManualScope(listId, {
              courseId: String(firstCourse.id),
              levelNumber: String(firstLevel.levelNumber)
            });
          }
        }
      } catch (err) {
        const errorCode = getApiErrorCode(err);
        if (errorCode === "EXAM_ASSESSMENT_SCOPE_NOT_CONFIGURED" || errorCode === "EXAM_LEVEL_NOT_IN_SCOPE") {
          await ensureScopeOptionsForList(row);
          setError("Select Exam Course and Level to continue.");
        } else {
          setError(getFriendlyErrorMessage(err) || "Failed to load assessment configuration options.");
        }
      } finally {
        setLoadingApprovalId((prev) => (prev === listId ? null : prev));
      }
    }
  };

  const setDraftLevelConfig = useCallback((listId, levelId, patch) => {
    setDraftConfigByListId((prev) => {
      const current = Array.isArray(prev[listId]) ? prev[listId] : [];
      const hasExistingLevel = current.some((item) => item.levelId === levelId);
      const next = hasExistingLevel
        ? current.map((item) => (item.levelId === levelId ? { ...item, ...patch } : item))
        : [
            ...current,
            {
              levelId,
              assessmentType: "WORKSHEET",
              worksheetId: "",
              questionBankId: "",
              questionCount: "",
              timeLimitMinutes: "",
              ...patch
            }
          ];
      return {
        ...prev,
        [listId]: next
      };
    });
  }, []);

  const saveAssessmentConfig = useCallback(async (listId) => {
    if (!listId) return;

    const row = rows.find((entry) => entry?.id === listId) || null;
    const effectiveScope = getEffectiveScopeForRow(row, listId);
    if (!effectiveScope?.courseId) {
      setError("Select Exam Course to continue.");
      throw new Error("EXAM_CONTEXT_REQUIRED");
    }

    const assessmentPayload = assessmentDataByListId[listId] || {};
    const draft = draftConfigByListId[listId] || [];
    const validation = getDraftValidation(assessmentPayload, draft);
    if (!validation.isComplete) {
      setError("Fix assessment configuration errors before saving.");
      throw new Error("ASSESSMENT_CONFIG_INCOMPLETE");
    }

    setSavingConfigListId(listId);
    setError("");
    try {
      await saveExamCycleAssessmentConfig(
        examCycleId,
        {
          listId,
          configs: draft
            .filter((item) => {
              const levelMeta = (assessmentPayload?.levels || []).find((level) => level.levelId === item.levelId);
              return levelMeta?.canConfigureAssessment !== false;
            })
            .map((item) => ({
            levelId: item.levelId,
            assessmentType: item.assessmentType,
            worksheetId: item.assessmentType === "WORKSHEET" ? item.worksheetId : null,
            questionBankId: item.assessmentType === "QUESTION_BANK" ? item.questionBankId : null,
            questionCount: item.assessmentType === "QUESTION_BANK" ? Number(item.questionCount) : null,
            timeLimitMinutes: item.assessmentType === "QUESTION_BANK" ? Number(item.timeLimitMinutes) : null
          }))
        },
        {
          courseId: effectiveScope.courseId
        }
      );

      const payload = await loadAssessmentOptions(listId, effectiveScope);
      syncScopeToUrl(effectiveScope.courseId, effectiveScope.levelNumber);

      setAssessmentDataByListId((prev) => ({
        ...prev,
        [listId]: payload
      }));
      toast.success("Assessment configuration saved.");
      return true;
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to save assessment configuration.");
      throw err;
    } finally {
      setSavingConfigListId(null);
    }
  }, [assessmentDataByListId, draftConfigByListId, examCycleId, getDraftValidation, getEffectiveScopeForRow, loadAssessmentOptions, rows, syncScopeToUrl]);

  const doConfirmApprove = async (listId) => {
    if (!listId || !canAct(listId)) return;
    if (loadingApprovalId === listId) return;

    const assessmentPayload = assessmentDataByListId[listId] || {};
    const draft = draftConfigByListId[listId] || [];
    const validation = getDraftValidation(assessmentPayload, draft);
    if (!validation.isComplete) {
      setError("Save a complete assessment configuration for every level before approval.");
      return;
    }

    setApproveListId(listId);
  };

  const executeApprove = async (listId) => {
    setApproveListId(null);
    setActingId(listId);
    setError("");
    try {
      const row = rows.find((entry) => entry?.id === listId) || null;
      const effectiveScope = getEffectiveScopeForRow(row, listId);
      if (!effectiveScope?.courseId) {
        setError("Select Exam Course to continue.");
        return;
      }

      await saveAssessmentConfig(listId);
      await approveEnrollmentListAsSuperadmin(examCycleId, listId, {
        courseId: effectiveScope.courseId
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to approve list.");
    } finally {
      setActingId(null);
    }
  };

  const doReject = async (listId) => {
    if (!listId || !canAct(listId)) return;
    setRejectListId(listId);
  };

  const executeReject = async (listId, remark) => {
    setRejectListId(null);
    setActingId(listId);
    setError("");
    try {
      await rejectPendingEnrollmentList(examCycleId, listId, { remark });
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to reject list.");
    } finally {
      setActingId(null);
    }
  };

  const doExport = async (listId) => {
    if (!listId) return;
    try {
      const resp = await exportEnrollmentListCsv(examCycleId, listId);
      downloadBlob(resp.data, `exam_enrollment_${examCycleId}_${listId}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading pending lists..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Enrollment Approvals</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Combined lists forwarded by Business Partners</div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ color: "var(--muted)" }}>Count: {rows.length}</div>
        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        emptyMessage={error ? "Unable to load pending lists. Use Refresh to retry." : "No pending combined lists."}
        columns={[
          {
            key: "center",
            header: "Center",
            render: (r) => r?.centerNode ? `${r.centerNode.name} (${r.centerNode.code || r.centerNode.id})` : "Unknown center"
          },
          { key: "entries", header: "Entries", render: (r) => String(r?.entriesCount ?? "") },
          { key: "status", header: "Status", render: (r) => r?.status || "" },
          { key: "forwardedAt", header: "Forwarded At", render: (r) => formatDateTime(r?.forwardedAt || r?.submittedAt) },
          {
            key: "actions",
            header: "Actions",
            wrap: true,
            render: (r) => (
              <div style={{ display: "grid", gap: 10, minWidth: 420 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" onClick={() => void doExport(r.id)} style={{ width: "auto" }}>
                    Export CSV
                  </button>
                  <button
                    className="button"
                    type="button"
                    onClick={() => void openApprovalForm(r.id)}
                    disabled={actingId === r.id || loadingApprovalId === r.id}
                    style={{ width: "auto" }}
                  >
                    {loadingApprovalId === r.id ? "Loading..." : editingId === r.id ? "Close" : "Approve"}
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => void doReject(r.id)}
                    disabled={actingId === r.id}
                    style={{ width: "auto" }}
                  >
                    Reject
                  </button>
                </div>

                {editingId === r.id ? (
                  <div className="card" style={{ padding: 12, display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Assessment Configuration: set Worksheet or Question Bank mode for every participating level before final approval.
                    </div>

                    {(() => {
                      const effectiveScope = getEffectiveScopeForRow(r, r.id);
                      if (effectiveScope?.courseId) {
                        return null;
                      }

                      const scopeOptions = scopeOptionsByListId[r.id] || null;
                      const manualScope = manualScopeByListId[r.id] || {};
                      const selectedCourseId = String(manualScope.courseId || "");
                      const selectedCourse = scopeOptions?.courses?.find((course) => String(course.id) === selectedCourseId) || null;
                      const selectedLevelNumber = String(manualScope.levelNumber || "");
                      const levelOptions = Array.isArray(selectedCourse?.levels) ? selectedCourse.levels : [];

                      return (
                        <div style={{ display: "grid", gap: 8, border: "1px solid var(--color-border)", borderRadius: 10, padding: 10 }}>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                            Select Exam Course and Level to continue.
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
                            <button
                              className="button secondary"
                              type="button"
                              style={{ width: "auto" }}
                              disabled={loadingScopeOptionsListId === r.id}
                              onClick={() => void ensureScopeOptionsForList(r)}
                            >
                              {loadingScopeOptionsListId === r.id ? "Loading scope..." : "Load Scope Options"}
                            </button>

                            <label style={{ display: "grid", gap: 4, minWidth: 220 }}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>Exam Course</span>
                              <select
                                value={selectedCourseId}
                                onChange={(event) => setManualScope(r.id, { courseId: event.target.value, levelNumber: "" })}
                                style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                              >
                                <option value="">Select exam course</option>
                                {(scopeOptions?.courses || []).map((course) => (
                                  <option key={course.id} value={course.id}>
                                    {course.code} · {course.name}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label style={{ display: "grid", gap: 4, minWidth: 200 }}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>Exam Level</span>
                              <select
                                value={selectedLevelNumber}
                                onChange={(event) => setManualScope(r.id, { levelNumber: event.target.value })}
                                disabled={!selectedCourse}
                                style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                              >
                                <option value="">Select level</option>
                                {levelOptions.map((level) => (
                                  <option key={level.id} value={level.levelNumber}>
                                    Level {level.levelNumber} · {level.title}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <button
                              className="button"
                              type="button"
                              style={{ width: "auto" }}
                              disabled={!selectedCourseId || loadingApprovalId === r.id}
                              onClick={async () => {
                                const nextScope = {
                                  courseId: selectedCourseId,
                                  levelNumber: selectedLevelNumber
                                };
                                syncScopeToUrl(nextScope.courseId, nextScope.levelNumber);
                                setLoadingApprovalId(r.id);
                                setError("");
                                try {
                                  await loadAssessmentOptions(r.id, nextScope);
                                } catch (err) {
                                  setError(getFriendlyErrorMessage(err) || "Failed to load assessment configuration options.");
                                } finally {
                                  setLoadingApprovalId((prev) => (prev === r.id ? null : prev));
                                }
                              }}
                            >
                              Apply Scope
                            </button>
                          </div>
                        </div>
                      );
                    })()}

                    {loadingApprovalId === r.id && !(assessmentDataByListId[r.id]?.levels || []).length ? (
                      <LoadingState label="Loading assessment options..." />
                    ) : null}

                    {!loadingApprovalId && !(assessmentDataByListId[r.id]?.levels || []).length ? (
                      <p style={{ margin: 0, color: "var(--color-text-muted)" }}>
                        No level breakdown is available for this request.
                      </p>
                    ) : null}

                    {(() => {
                      const assessmentPayload = assessmentDataByListId[r.id] || {};
                      const levelsFromPayload = Array.isArray(assessmentPayload.levels) ? assessmentPayload.levels : [];
                      const levels = levelsFromPayload.length
                        ? levelsFromPayload
                        : (Array.isArray(r?.levelBreakdown)
                          ? r.levelBreakdown.map((entry) => ({
                            levelId: entry.levelId,
                            levelName: entry.levelName,
                            levelRank: entry.levelRank,
                            studentCount: entry.studentCount
                          }))
                          : []);
                      const draft = draftConfigByListId[r.id] || [];
                      const validation = getDraftValidation(assessmentPayload, draft);
                      const draftByLevelId = new Map(draft.map((item) => [item.levelId, item]));

                      return levels.map((b) => {
                        const levelId = b.levelId;
                        const wsOptions = assessmentPayload?.worksheetsByLevelId?.[levelId] || [];
                        const bankOptions = assessmentPayload?.questionBanksByLevelId?.[levelId] || [];
                        const worksheetScopeWarning = assessmentPayload?.worksheetScopeWarningsByLevelId?.[levelId] || "";
                        const current = draftByLevelId.get(levelId) || {
                          levelId,
                          assessmentType: "WORKSHEET",
                          worksheetId: "",
                          questionBankId: "",
                          questionCount: "",
                          timeLimitMinutes: ""
                        };
                        const levelErrors = validation.errorsByLevelId[levelId] || [];

                        return (
                          <div key={levelId} style={{ display: "grid", gap: 6, border: "1px solid var(--color-border)", borderRadius: 10, padding: 10 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <strong>
                                {b.levelName || levelId} (Students: {b.studentCount})
                              </strong>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>Rank: {String(b.levelRank ?? "")}</span>
                            </div>

                            {b?.canConfigureAssessment === false ? (
                              <p className="error" style={{ margin: 0 }}>
                                {b?.scopeError || `Exam course Level ${String(b?.levelRank ?? "").trim() || "?"} is not configured.`}
                              </p>
                            ) : null}

                            {b?.canConfigureAssessment === false ? null : (
                              <>

                            <label style={{ display: "grid", gap: 4 }}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>Assessment Type</span>
                              <select
                                value={current.assessmentType}
                                onChange={(e) => {
                                  const nextType = e.target.value;
                                  setDraftLevelConfig(r.id, levelId, {
                                    assessmentType: nextType,
                                    worksheetId: "",
                                    questionBankId: "",
                                    questionCount: "",
                                    timeLimitMinutes: ""
                                  });
                                }}
                                style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                              >
                                <option value="WORKSHEET">Worksheet</option>
                                <option value="QUESTION_BANK">Question Bank</option>
                              </select>
                            </label>

                            {current.assessmentType === "WORKSHEET" ? (
                              <label style={{ display: "grid", gap: 4 }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>Select Worksheet</span>
                                <select
                                  value={current.worksheetId || ""}
                                  onChange={(e) => setDraftLevelConfig(r.id, levelId, { worksheetId: e.target.value })}
                                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                                >
                                  <option value="">-- Select worksheet --</option>
                                  {wsOptions.map((w) => {
                                    const isWorksheetDisabled = w.isSelectable === false || w.disabled;
                                    const statusLabel = w.status || (w.isPublished === false ? "DRAFT" : "PUBLISHED");
                                    const detailLabel = isWorksheetDisabled && w.unavailableReason ? ` - ${w.unavailableReason}` : "";
                                    return (
                                      <option key={w.id} value={w.id} disabled={isWorksheetDisabled}>
                                        {w.title} (Q: {w.questionCount}, {statusLabel}){detailLabel}
                                      </option>
                                    );
                                  })}
                                </select>
                                {worksheetScopeWarning ? (
                                  <span className="error" style={{ margin: 0 }}>{worksheetScopeWarning}</span>
                                ) : null}
                              </label>
                            ) : null}

                            {current.assessmentType === "QUESTION_BANK" ? (
                              <div style={{ display: "grid", gap: 8 }}>
                                <label style={{ display: "grid", gap: 4 }}>
                                  <span style={{ fontSize: 12, color: "var(--muted)" }}>Select Question Bank</span>
                                  <select
                                    value={current.questionBankId || ""}
                                    onChange={(e) => setDraftLevelConfig(r.id, levelId, { questionBankId: e.target.value })}
                                    style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                                  >
                                    <option value="">-- Select question bank --</option>
                                    {bankOptions.map((bank) => (
                                      <option key={bank.id} value={bank.id}>
                                        {bank.name} (Questions: {bank.availableQuestionCount})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                                  <label style={{ display: "grid", gap: 4 }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Number of Questions</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={current.questionCount}
                                      onChange={(e) => setDraftLevelConfig(r.id, levelId, { questionCount: e.target.value })}
                                      style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                                    />
                                  </label>
                                  <label style={{ display: "grid", gap: 4 }}>
                                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Time Limit (Minutes)</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={current.timeLimitMinutes}
                                      onChange={(e) => setDraftLevelConfig(r.id, levelId, { timeLimitMinutes: e.target.value })}
                                      style={{ padding: 8, borderRadius: 8, border: "1px solid var(--color-border)" }}
                                    />
                                  </label>
                                </div>
                              </div>
                            ) : null}

                            {levelErrors.length ? (
                              <div style={{ display: "grid", gap: 2 }}>
                                {levelErrors.map((message) => (
                                  <span key={message} className="error" style={{ margin: 0 }}>
                                    {message}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Configuration valid</span>
                            )}

                              </>
                            )}
                          </div>
                        );
                      });
                    })()}

                    <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
                      <button
                        className="button secondary"
                        type="button"
                        onClick={() => void saveAssessmentConfig(r.id)}
                        disabled={savingConfigListId === r.id || actingId === r.id || loadingApprovalId === r.id}
                        style={{ width: "auto" }}
                      >
                        {savingConfigListId === r.id ? "Saving..." : "Save Configuration"}
                      </button>
                      <button
                        className="button"
                        type="button"
                        onClick={() => void doConfirmApprove(r.id)}
                        disabled={
                          actingId === r.id ||
                          loadingApprovalId === r.id ||
                          savingConfigListId === r.id ||
                          !(assessmentDataByListId[r.id]?.levels || []).length ||
                          !getDraftValidation(assessmentDataByListId[r.id] || {}, draftConfigByListId[r.id] || []).isComplete
                        }
                        style={{ width: "auto" }}
                      >
                        {actingId === r.id ? "Working..." : "Final Approval"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <ConfirmDialog
        open={!!approveListId}
        title="Approve Enrollment List"
        message="Approve this combined list with the saved level-wise assessment configuration?"
        confirmLabel="Approve"
        onCancel={() => setApproveListId(null)}
        onConfirm={() => void executeApprove(approveListId)}
      />

      <InputDialog
        open={!!rejectListId}
        title="Reject Enrollment List"
        message="Reject this combined list back down the chain?"
        inputLabel="Remark (optional)"
        inputPlaceholder="Reason for rejection"
        confirmLabel="Reject"
        onCancel={() => setRejectListId(null)}
        onConfirm={(val) => void executeReject(rejectListId, val)}
      />
    </section>
  );
}

export { SuperadminExamPendingListsPage };
