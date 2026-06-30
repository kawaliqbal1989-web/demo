import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { PaginationBar } from "../../components/DataTable";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { formatWorksheetQuestionPrompt } from "../../utils/worksheetQuestions";
import { getCourse } from "../../services/coursesService";
import { listCourseLevels } from "../../services/courseLevelsService";
import {
  archiveCompetitionCoursePaper,
  archiveCompetitionCoursePaperBlueprint,
  createCompetitionCoursePaper,
  createCompetitionCoursePaperBlueprint,
  generateCompetitionCoursePaperWorksheet,
  getCompetitionCourse,
  listCompetitionCourseLevelQuestionBank,
  listCompetitionCourseLevels,
  listCompetitionCoursePaperBlueprints,
  listCompetitionCoursePapers,
  updateCompetitionCoursePaperBlueprint,
  updateCompetitionCoursePaper
} from "../../services/competitionCoursesService";
import { listLevels } from "../../services/levelsService";
import { getWorksheetTemplate, upsertWorksheetTemplate } from "../../services/worksheetTemplatesService";
import { listQuestionBank } from "../../services/questionBankService";
import { resolveAcademicLevelForCourseLevel } from "../../utils/courseLevelMapping";
import { formatWorksheetQuestionPreview } from "../../utils/worksheetQuestionPreview";
import {
  addWorksheetQuestion,
  addWorksheetQuestionsBulk,
  createWorksheet,
  deleteWorksheet,
  deleteWorksheetQuestion,
  duplicateWorksheet,
  getWorksheet,
  listWorksheets,
  updateWorksheet,
  reorderWorksheetQuestions
} from "../../services/worksheetsService";

function displayQuestion(question) {
  return formatWorksheetQuestionPrompt(question);
}
function SuperadminCourseLevelWorksheetsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { courseId, levelNumber, levelId } = useParams();
  const isCompetitionCourseMode = location.pathname.startsWith("/superadmin/competition/courses/");
  const levelNumberInt = Number(levelNumber);

  const [course, setCourse] = useState(null);
  const [courseLevels, setCourseLevels] = useState([]);
  const [academicLevels, setAcademicLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [template, setTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    totalQuestions: "10",
    easyCount: "3",
    mediumCount: "5",
    hardCount: "2",
    timeLimitSeconds: "600",
    isActive: true
  });
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState("");

  const [bankItems, setBankItems] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);

  const [papers, setPapers] = useState([]);
  const [papersLoading, setPapersLoading] = useState(false);
  const [papersError, setPapersError] = useState("");
  const [selectedPaperId, setSelectedPaperId] = useState("");
  const [paperForm, setPaperForm] = useState({
    title: "",
    code: "",
    description: "",
    sortOrder: "0",
    status: "DRAFT"
  });
  const [paperSaving, setPaperSaving] = useState(false);
  const [paperEditingId, setPaperEditingId] = useState("");
  const [blueprints, setBlueprints] = useState([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(false);
  const [blueprintsError, setBlueprintsError] = useState("");
  const [blueprintForm, setBlueprintForm] = useState({
    title: "",
    version: "1",
    status: "DRAFT",
    totalQuestions: "",
    totalMarks: "",
    durationMinutes: "",
    difficultyDistribution: "{}",
    categoryDistribution: "{}",
    operationDistribution: "{}",
    mandatoryQuestionIds: "[]",
    randomizeQuestions: false,
    randomizeOptions: false,
    instructions: "",
    sortOrder: "0"
  });
  const [blueprintEditingId, setBlueprintEditingId] = useState("");
  const [blueprintSaving, setBlueprintSaving] = useState(false);
  const [worksheetGenerationForm, setWorksheetGenerationForm] = useState({
    paperId: "",
    blueprintId: "",
    title: "",
    version: "",
    seed: ""
  });
  const [worksheetGenerating, setWorksheetGenerating] = useState(false);

  const [worksheets, setWorksheets] = useState([]);
  const [worksheetsLoading, setWorksheetsLoading] = useState(false);
  const [worksheetsError, setWorksheetsError] = useState("");
  const [worksheetsLimit, setWorksheetsLimit] = useState(10);
  const [worksheetsOffset, setWorksheetsOffset] = useState(0);
  const [worksheetsPublished, setWorksheetsPublished] = useState("");
  const [worksheetsDifficulty, setWorksheetsDifficulty] = useState("");
  const [worksheetsQ, setWorksheetsQ] = useState("");
  const [worksheetCreateForm, setWorksheetCreateForm] = useState({
    title: "",
    description: "",
    difficulty: "MEDIUM",
    isPublished: false
  });
  const [worksheetCreating, setWorksheetCreating] = useState(false);

  const [selectedWorksheetId, setSelectedWorksheetId] = useState(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetLoading, setWorksheetLoading] = useState(false);
  const [worksheetError, setWorksheetError] = useState("");
  const [questionAddBankId, setQuestionAddBankId] = useState("");
  const [questionAdding, setQuestionAdding] = useState(false);
  const [bulkQuestionIds, setBulkQuestionIds] = useState([]);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [worksheetMetaForm, setWorksheetMetaForm] = useState({
    title: "",
    description: "",
    difficulty: "MEDIUM",
    isPublished: false
  });
  const [worksheetMetaSaving, setWorksheetMetaSaving] = useState(false);
  const [deleteWorksheetTarget, setDeleteWorksheetTarget] = useState(null);
  const [deleteQuestionTarget, setDeleteQuestionTarget] = useState(null);
  const [duplicateWorksheetTarget, setDuplicateWorksheetTarget] = useState(null);

  const [dirtyOrder, setDirtyOrder] = useState(false);
  const dragIdRef = useRef(null);

  const courseLevel = useMemo(() => {
    if (isCompetitionCourseMode) {
      return courseLevels.find((item) => item.id === levelId) || null;
    }
    return courseLevels.find((item) => Number(item.levelNumber) === levelNumberInt) || null;
  }, [courseLevels, isCompetitionCourseMode, levelId, levelNumberInt]);

  const academicLevel = useMemo(() => {
    if (isCompetitionCourseMode) {
      return null;
    }
    return resolveAcademicLevelForCourseLevel({
      courseLevel,
      academicLevels,
      levelNumber: levelNumberInt
    });
  }, [academicLevels, courseLevel, isCompetitionCourseMode, levelNumberInt]);

  const worksheetScopeId = isCompetitionCourseMode ? courseLevel?.id : academicLevel?.id;

  const worksheetScopeParams = useMemo(() => (
    isCompetitionCourseMode
      ? (selectedPaperId
        ? { competitionCoursePaperId: selectedPaperId }
        : { competitionCourseLevelId: worksheetScopeId })
      : { levelId: worksheetScopeId }
  ), [isCompetitionCourseMode, selectedPaperId, worksheetScopeId]);

  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedPaperId) || null,
    [papers, selectedPaperId]
  );

  const selectedBlueprint = useMemo(
    () => blueprints.find((blueprint) => blueprint.id === blueprintEditingId) || null,
    [blueprints, blueprintEditingId]
  );

  const activeBlueprints = useMemo(
    () => blueprints.filter((blueprint) => blueprint.status === "ACTIVE"),
    [blueprints]
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [courseResp, courseLevelsResp, academicLevelsResp] = isCompetitionCourseMode
        ? await Promise.all([
            getCompetitionCourse(courseId),
            listCompetitionCourseLevels({ courseId, limit: 100, offset: 0 }),
            Promise.resolve({ data: [] })
          ])
        : await Promise.all([
            getCourse(courseId),
            listCourseLevels({ courseId, limit: 100, offset: 0 }),
            listLevels()
          ]);
      setCourse(courseResp?.data || null);
      setCourseLevels(courseLevelsResp?.data?.items || []);
      setAcademicLevels(academicLevelsResp?.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load course level context.");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplate = async (levelId) => {
    setTemplateError("");
    try {
      const resp = await getWorksheetTemplate(levelId);
      const next = resp?.data || null;
      setTemplate(next);
      if (next) {
        setTemplateForm({
          name: next.name || "",
          totalQuestions: String(next.totalQuestions ?? ""),
          easyCount: String(next.easyCount ?? ""),
          mediumCount: String(next.mediumCount ?? ""),
          hardCount: String(next.hardCount ?? ""),
          timeLimitSeconds: String(next.timeLimitSeconds ?? ""),
          isActive: Boolean(next.isActive)
        });
      }
    } catch (err) {
      setTemplateError(getFriendlyErrorMessage(err) || "Failed to load worksheet template.");
    }
  };

  const loadBank = async (levelId) => {
    setBankLoading(true);
    try {
      const resp = isCompetitionCourseMode
        ? await listCompetitionCourseLevelQuestionBank({ courseId, levelId })
        : await listQuestionBank({ levelId });
      setBankItems(resp?.data?.items || []);
    } catch {
      setBankItems([]);
    } finally {
      setBankLoading(false);
    }
  };

  const loadPapers = async (levelId) => {
    if (!isCompetitionCourseMode) {
      setPapers([]);
      setSelectedPaperId("");
      return;
    }

    setPapersLoading(true);
    setPapersError("");
    try {
      const resp = await listCompetitionCoursePapers({ courseId, levelId });
      const items = resp?.data?.items || [];
      setPapers(items);
      setPaperEditingId("");

      if (selectedPaperId && !items.some((item) => item.id === selectedPaperId)) {
        setSelectedPaperId("");
      }
    } catch (err) {
      setPapersError(getFriendlyErrorMessage(err) || "Failed to load papers.");
      setPapers([]);
    } finally {
      setPapersLoading(false);
    }
  };

  const loadBlueprints = async (paperId) => {
    if (!isCompetitionCourseMode || !paperId) {
      setBlueprints([]);
      setBlueprintEditingId("");
      return;
    }

    setBlueprintsLoading(true);
    setBlueprintsError("");
    try {
      const resp = await listCompetitionCoursePaperBlueprints({ courseId, levelId: courseLevel.id, paperId });
      setBlueprints(resp?.data?.items || []);
      if (blueprintEditingId && !(resp?.data?.items || []).some((item) => item.id === blueprintEditingId)) {
        setBlueprintEditingId("");
      }
    } catch (err) {
      setBlueprintsError(getFriendlyErrorMessage(err) || "Failed to load blueprints.");
      setBlueprints([]);
    } finally {
      setBlueprintsLoading(false);
    }
  };

  const loadWorksheets = async (levelId, options = {}) => {
    const next = {
      limit: options.limit ?? worksheetsLimit,
      offset: options.offset ?? worksheetsOffset,
      published: options.published ?? worksheetsPublished,
      difficulty: options.difficulty ?? worksheetsDifficulty,
      q: options.q ?? worksheetsQ
    };

    setWorksheetsLoading(true);
    setWorksheetsError("");
    try {
      const resp = await listWorksheets({
        ...worksheetScopeParams,
        limit: next.limit,
        offset: next.offset,
        published: next.published || undefined,
        difficulty: next.difficulty || undefined,
        q: next.q || undefined
      });
      setWorksheets(resp?.data || []);
      setWorksheetsLimit(next.limit);
      setWorksheetsOffset(next.offset);

      if (selectedWorksheetId && !(resp?.data || []).some((row) => row.id === selectedWorksheetId)) {
        setSelectedWorksheetId(null);
        setSelectedWorksheet(null);
      }
    } catch (err) {
      setWorksheetsError(getFriendlyErrorMessage(err) || "Failed to load worksheets.");
    } finally {
      setWorksheetsLoading(false);
    }
  };

  const loadWorksheet = async (id) => {
    setWorksheetLoading(true);
    setWorksheetError("");
    setDirtyOrder(false);
    try {
      const resp = await getWorksheet(id);
      setSelectedWorksheet(resp?.data || null);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to load worksheet.");
      setSelectedWorksheet(null);
    } finally {
      setWorksheetLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [courseId, levelId, levelNumber]);

  useEffect(() => {
    if (!worksheetScopeId) {
      return;
    }

    if (!isCompetitionCourseMode) {
      void loadTemplate(worksheetScopeId);
    }

    // Load the scoped question bank for both normal course levels and competition course levels.
    void loadBank(worksheetScopeId);
    void loadPapers(worksheetScopeId);
    void loadBlueprints(selectedPaperId);

    void loadWorksheets(worksheetScopeId, { offset: 0 });
  }, [worksheetScopeId, isCompetitionCourseMode, selectedPaperId]);

  useEffect(() => {
    if (!isCompetitionCourseMode) {
      return;
    }

    setWorksheetGenerationForm((prev) => {
      const nextPaperId = selectedPaperId || "";
      const nextBlueprintId = selectedPaperId
        ? (activeBlueprints.some((blueprint) => blueprint.id === prev.blueprintId)
          ? prev.blueprintId
          : (activeBlueprints[0]?.id || ""))
        : "";

      if (prev.paperId === nextPaperId && prev.blueprintId === nextBlueprintId) {
        return prev;
      }

      return {
        ...prev,
        paperId: nextPaperId,
        blueprintId: nextBlueprintId
      };
    });
  }, [activeBlueprints, isCompetitionCourseMode, selectedPaperId]);

  useEffect(() => {
    if (!selectedWorksheetId) {
      setSelectedWorksheet(null);
      return;
    }
    void loadWorksheet(selectedWorksheetId);
  }, [selectedWorksheetId]);

  useEffect(() => {
    if (!selectedWorksheet) {
      return;
    }

    setWorksheetMetaForm({
      title: selectedWorksheet.title || "",
      description: selectedWorksheet.description || "",
      difficulty: selectedWorksheet.difficulty || "MEDIUM",
      isPublished: Boolean(selectedWorksheet.isPublished)
    });
  }, [selectedWorksheet]);

  if (loading) {
    return <LoadingState label="Loading worksheets..." />;
  }

  if (error) {
    return <ErrorState title="Failed to load" message={error} onRetry={load} />;
  }

  if (!course || !courseLevel) {
    return <ErrorState title="Level not found" message="The course level could not be resolved." />;
  }

  if (!isCompetitionCourseMode && !academicLevel) {
    return <ErrorState title="Level mapping missing" message="No academic level exists for this level number." />;
  }

  const onSaveTemplate = async (event) => {
    event.preventDefault();
    setTemplateSaving(true);
    setTemplateError("");
    try {
      await upsertWorksheetTemplate(academicLevel.id, {
        name: templateForm.name,
        totalQuestions: Number(templateForm.totalQuestions),
        easyCount: Number(templateForm.easyCount),
        mediumCount: Number(templateForm.mediumCount),
        hardCount: Number(templateForm.hardCount),
        timeLimitSeconds: Number(templateForm.timeLimitSeconds),
        isActive: Boolean(templateForm.isActive)
      });
      await loadTemplate(academicLevel.id);
    } catch (err) {
      setTemplateError(getFriendlyErrorMessage(err) || "Failed to save worksheet template.");
    } finally {
      setTemplateSaving(false);
    }
  };

  const onCreateWorksheet = async (event) => {
    event.preventDefault();
    setWorksheetCreating(true);
    setWorksheetsError("");
    try {
      if (!worksheetCreateForm.title.trim()) {
        setWorksheetsError("Worksheet title is required.");
        return;
      }

      if (worksheetCreateForm.isPublished) {
        setWorksheetsError("Create worksheet as draft first. Add questions, then publish from Worksheet Details.");
        return;
      }

      await createWorksheet({
        title: worksheetCreateForm.title.trim(),
        description: worksheetCreateForm.description.trim() || null,
        difficulty: worksheetCreateForm.difficulty,
        ...(isCompetitionCourseMode && selectedPaperId
          ? { competitionCourseLevelId: courseLevel.id, competitionCoursePaperId: selectedPaperId }
          : worksheetScopeParams),
        isPublished: false
      });

      setWorksheetCreateForm({ title: "", description: "", difficulty: "MEDIUM", isPublished: false });
      await loadWorksheets(worksheetScopeId, { offset: 0 });
    } catch (err) {
      setWorksheetsError(getFriendlyErrorMessage(err) || "Failed to create worksheet.");
    } finally {
      setWorksheetCreating(false);
    }
  };

  const onSavePaper = async (event) => {
    event.preventDefault();
    if (!isCompetitionCourseMode) {
      return;
    }

    setPaperSaving(true);
    setPapersError("");
    try {
      const title = String(paperForm.title || "").trim();
      if (!title) {
        setPapersError("Paper title is required.");
        return;
      }

      const payload = {
        title,
        code: String(paperForm.code || "").trim() || null,
        description: String(paperForm.description || "").trim() || null,
        sortOrder: Number(paperForm.sortOrder || 0),
        status: paperForm.status
      };

      if (paperEditingId) {
        await updateCompetitionCoursePaper({
          courseId,
          levelId: courseLevel.id,
          paperId: paperEditingId,
          ...payload
        });
      } else {
        const resp = await createCompetitionCoursePaper({
          courseId,
          levelId: courseLevel.id,
          ...payload
        });
        const createdId = resp?.data?.id || null;
        if (createdId) {
          setSelectedPaperId(createdId);
        }
      }

      setPaperForm({ title: "", code: "", description: "", sortOrder: "0", status: "DRAFT" });
      setPaperEditingId("");
      await loadPapers(courseLevel.id);
      await loadWorksheets(worksheetScopeId, { offset: 0 });
    } catch (err) {
      setPapersError(getFriendlyErrorMessage(err) || "Failed to save paper.");
    } finally {
      setPaperSaving(false);
    }
  };

  const onSaveBlueprint = async (event) => {
    event.preventDefault();
    if (!isCompetitionCourseMode || !selectedPaperId) {
      return;
    }

    setBlueprintSaving(true);
    setBlueprintsError("");
    try {
      const title = String(blueprintEditingId ? blueprintForm.title : blueprintForm.title || "").trim();
      if (!title) {
        setBlueprintsError("Blueprint title is required.");
        return;
      }

      const payload = {
        title,
        version: Number(blueprintForm.version || 1),
        status: blueprintForm.status,
        totalQuestions: blueprintForm.totalQuestions === "" ? null : Number(blueprintForm.totalQuestions),
        totalMarks: blueprintForm.totalMarks === "" ? null : Number(blueprintForm.totalMarks),
        durationMinutes: blueprintForm.durationMinutes === "" ? null : Number(blueprintForm.durationMinutes),
        difficultyDistribution: blueprintForm.difficultyDistribution ? JSON.parse(blueprintForm.difficultyDistribution) : null,
        categoryDistribution: blueprintForm.categoryDistribution ? JSON.parse(blueprintForm.categoryDistribution) : null,
        operationDistribution: blueprintForm.operationDistribution ? JSON.parse(blueprintForm.operationDistribution) : null,
        mandatoryQuestionIds: blueprintForm.mandatoryQuestionIds ? JSON.parse(blueprintForm.mandatoryQuestionIds) : null,
        randomizeQuestions: Boolean(blueprintForm.randomizeQuestions),
        randomizeOptions: Boolean(blueprintForm.randomizeOptions),
        instructions: blueprintForm.instructions.trim() || null,
        sortOrder: Number(blueprintForm.sortOrder || 0)
      };

      if (blueprintEditingId) {
        await updateCompetitionCoursePaperBlueprint({
          courseId,
          levelId: courseLevel.id,
          paperId: selectedPaperId,
          blueprintId: blueprintEditingId,
          payload
        });
      } else {
        await createCompetitionCoursePaperBlueprint({
          courseId,
          levelId: courseLevel.id,
          paperId: selectedPaperId,
          payload
        });
      }

      setBlueprintForm({
        title: "",
        version: "1",
        status: "DRAFT",
        totalQuestions: "",
        totalMarks: "",
        durationMinutes: "",
        difficultyDistribution: "{}",
        categoryDistribution: "{}",
        operationDistribution: "{}",
        mandatoryQuestionIds: "[]",
        randomizeQuestions: false,
        randomizeOptions: false,
        instructions: "",
        sortOrder: "0"
      });
      setBlueprintEditingId("");
      await loadBlueprints(selectedPaperId);
    } catch (err) {
      setBlueprintsError(getFriendlyErrorMessage(err) || "Failed to save blueprint.");
    } finally {
      setBlueprintSaving(false);
    }
  };

  const onEditBlueprint = (blueprint) => {
    setBlueprintEditingId(blueprint.id);
    setBlueprintForm({
      title: blueprint.title || "",
      version: String(blueprint.version ?? 1),
      status: blueprint.status || "DRAFT",
      totalQuestions: blueprint.totalQuestions ?? "",
      totalMarks: blueprint.totalMarks ?? "",
      durationMinutes: blueprint.durationMinutes ?? "",
      difficultyDistribution: JSON.stringify(blueprint.difficultyDistribution ?? {}, null, 2),
      categoryDistribution: JSON.stringify(blueprint.categoryDistribution ?? {}, null, 2),
      operationDistribution: JSON.stringify(blueprint.operationDistribution ?? {}, null, 2),
      mandatoryQuestionIds: JSON.stringify(blueprint.mandatoryQuestionIds ?? [], null, 2),
      randomizeQuestions: Boolean(blueprint.randomizeQuestions),
      randomizeOptions: Boolean(blueprint.randomizeOptions),
      instructions: blueprint.instructions || "",
      sortOrder: String(blueprint.sortOrder ?? 0)
    });
  };

  const onArchiveBlueprint = async (blueprint) => {
    setBlueprintsError("");
    try {
      await archiveCompetitionCoursePaperBlueprint({
        courseId,
        levelId: courseLevel.id,
        paperId: selectedPaperId,
        blueprintId: blueprint.id
      });
      await loadBlueprints(selectedPaperId);
    } catch (err) {
      setBlueprintsError(getFriendlyErrorMessage(err) || "Failed to archive blueprint.");
    }
  };

  const onGenerateWorksheetFromBlueprint = async (event) => {
    event.preventDefault();
    if (!isCompetitionCourseMode || !selectedPaperId || !worksheetGenerationForm.blueprintId) {
      return;
    }

    const title = String(worksheetGenerationForm.title || "").trim();
    if (!title) {
      setWorksheetsError("Worksheet title is required.");
      return;
    }

    setWorksheetGenerating(true);
    setWorksheetsError("");
    try {
      const resp = await generateCompetitionCoursePaperWorksheet({
        courseId,
        levelId: courseLevel.id,
        paperId: selectedPaperId,
        blueprintId: worksheetGenerationForm.blueprintId,
        payload: {
          title,
          version: String(worksheetGenerationForm.version || "").trim() || undefined,
          seed: String(worksheetGenerationForm.seed || "").trim() || undefined
        }
      });

      const createdId = resp?.data?.id || null;
      setWorksheetGenerationForm((prev) => ({
        ...prev,
        title: "",
        version: "",
        seed: ""
      }));
      await loadWorksheets(worksheetScopeId, { offset: 0 });
      if (createdId) {
        setSelectedWorksheetId(createdId);
      }
    } catch (err) {
      setWorksheetsError(getFriendlyErrorMessage(err) || "Failed to generate worksheet.");
    } finally {
      setWorksheetGenerating(false);
    }
  };

  const onEditPaper = (paper) => {
    setPaperEditingId(paper.id);
    setPaperForm({
      title: paper.title || "",
      code: paper.code || "",
      description: paper.description || "",
      sortOrder: String(paper.sortOrder ?? 0),
      status: paper.status || "DRAFT"
    });
  };

  const onArchivePaper = async (paper) => {
    setPapersError("");
    try {
      await archiveCompetitionCoursePaper({
        courseId,
        levelId: courseLevel.id,
        paperId: paper.id
      });
      if (selectedPaperId === paper.id) {
        setSelectedPaperId("");
      }
      await loadPapers(courseLevel.id);
      await loadWorksheets(worksheetScopeId, { offset: 0 });
    } catch (err) {
      setPapersError(getFriendlyErrorMessage(err) || "Failed to archive paper.");
    }
  };

  const onAddQuestionToWorksheet = async () => {
    if (!selectedWorksheet?.id || !questionAddBankId) {
      return;
    }

    setQuestionAdding(true);
    setWorksheetError("");
    try {
      await addWorksheetQuestion(selectedWorksheet.id, { questionBankId: questionAddBankId });
      setQuestionAddBankId("");
      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(worksheetScopeId);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to add question.");
    } finally {
      setQuestionAdding(false);
    }
  };

  const moveQuestion = (fromId, toId) => {
    if (!fromId || !toId || fromId === toId) {
      return;
    }

    const ids = (selectedWorksheet?.questions || []).map((item) => item.id);
    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const reorderedIds = [...ids];
    reorderedIds.splice(fromIndex, 1);
    reorderedIds.splice(toIndex, 0, fromId);

    const byId = new Map((selectedWorksheet?.questions || []).map((item) => [item.id, item]));
    const reordered = reorderedIds.map((id) => byId.get(id)).filter(Boolean);

    setSelectedWorksheet((prev) => (prev ? { ...prev, questions: reordered } : prev));
    setDirtyOrder(true);
  };

  const onSaveOrder = async () => {
    if (!selectedWorksheet?.id) {
      return;
    }

    setWorksheetError("");
    try {
      const orderedIds = (selectedWorksheet.questions || []).map((item) => item.id);
      await reorderWorksheetQuestions(selectedWorksheet.id, orderedIds);
      setDirtyOrder(false);
      await loadWorksheet(selectedWorksheet.id);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to reorder worksheet questions.");
    }
  };

  const onSaveWorksheetMeta = async (event) => {
    event.preventDefault();
    if (!selectedWorksheet?.id) {
      return;
    }

    setWorksheetMetaSaving(true);
    setWorksheetError("");
    try {
      await updateWorksheet(selectedWorksheet.id, {
        title: worksheetMetaForm.title.trim(),
        description: worksheetMetaForm.description.trim() || null,
        difficulty: worksheetMetaForm.difficulty,
        isPublished: Boolean(worksheetMetaForm.isPublished)
      });

      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(worksheetScopeId);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to update worksheet.");
    } finally {
      setWorksheetMetaSaving(false);
    }
  };

  const onDuplicateWorksheet = async () => {
    const target = duplicateWorksheetTarget;
    setDuplicateWorksheetTarget(null);
    if (!target) {
      return;
    }

    setWorksheetError("");
    try {
      const resp = await duplicateWorksheet(target.id);
      const createdId = resp?.data?.id || null;
      await loadWorksheets(worksheetScopeId, { offset: 0 });
      if (createdId) {
        setSelectedWorksheetId(createdId);
      }
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to duplicate worksheet.");
    }
  };

  const onAddBulkQuestions = async () => {
    if (!selectedWorksheet?.id || !bulkQuestionIds.length) {
      return;
    }

    setBulkAdding(true);
    setWorksheetError("");
    try {
      await addWorksheetQuestionsBulk(selectedWorksheet.id, bulkQuestionIds);
      setBulkQuestionIds([]);
      await loadWorksheet(selectedWorksheet.id);
      await loadWorksheets(worksheetScopeId);
    } catch (err) {
      setWorksheetError(getFriendlyErrorMessage(err) || "Failed to add selected questions.");
    } finally {
      setBulkAdding(false);
    }
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>
          Worksheets: {course.name} · Level {isCompetitionCourseMode ? courseLevel.levelNumber : levelNumberInt}
        </h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Manage worksheet template, create worksheets, and build worksheet questions.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          className="button secondary"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate(isCompetitionCourseMode ? `/superadmin/competition/courses/${courseId}/levels` : `/superadmin/courses/${courseId}/levels/${levelNumber}`)}
        >
          Back
        </button>
        {!isCompetitionCourseMode ? <button
          className="button"
          type="button"
          style={{ width: "auto" }}
          onClick={() => navigate(`/superadmin/courses/${courseId}/levels/${levelNumber}/question-bank`)}
        >
          Open Question Bank
        </button> : null}
      </div>

      {isCompetitionCourseMode ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Competition Papers</h3>
              <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
                Select a paper to scope worksheets, or keep the level view for legacy worksheets.
              </p>
            </div>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              onClick={() => setSelectedPaperId("")}
            >
              Level Worksheets
            </button>
          </div>

          {papersError ? <div className="error">{papersError}</div> : null}

          <form onSubmit={onSavePaper} style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
              <label>
                Title
                <input
                  className="input"
                  value={paperForm.title}
                  onChange={(event) => setPaperForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Paper A"
                />
              </label>
              <label>
                Code
                <input
                  className="input"
                  value={paperForm.code}
                  onChange={(event) => setPaperForm((prev) => ({ ...prev, code: event.target.value }))}
                  placeholder="PAPER-A"
                />
              </label>
              <label>
                Sort Order
                <input
                  className="input"
                  inputMode="numeric"
                  value={paperForm.sortOrder}
                  onChange={(event) => setPaperForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                />
              </label>
              <label>
                Status
                <select
                  className="select"
                  value={paperForm.status}
                  onChange={(event) => setPaperForm((prev) => ({ ...prev, status: event.target.value }))}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Description
                <textarea
                  className="input"
                  style={{ minHeight: 88, resize: "vertical" }}
                  rows={3}
                  value={paperForm.description}
                  onChange={(event) => setPaperForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Optional paper notes"
                />
              </label>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button className="button" type="submit" style={{ width: "auto" }} disabled={paperSaving}>
                {paperSaving ? (paperEditingId ? "Saving..." : "Creating...") : (paperEditingId ? "Save Paper" : "Add Paper")}
              </button>
              {paperEditingId ? (
                <button
                  type="button"
                  className="button secondary"
                  style={{ width: "auto" }}
                  onClick={() => {
                    setPaperEditingId("");
                    setPaperForm({ title: "", code: "", description: "", sortOrder: "0", status: "DRAFT" });
                    setPapersError("");
                  }}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div style={{ display: "grid", gap: 8 }}>
            {papersLoading ? <div style={{ fontSize: 13, opacity: 0.75 }}>Loading papers...</div> : null}
            {!papersLoading && !papers.length ? (
              <div style={{ fontSize: 13, opacity: 0.75 }}>No papers yet. Add one to start grouping worksheets.</div>
            ) : null}
            {papers.map((paper) => (
              <div key={paper.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <div style={{ fontWeight: 700 }}>
                    {paper.title}
                    {paper.code ? ` · ${paper.code}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {paper.status} · Sort {paper.sortOrder}
                    {paper.id === selectedPaperId ? " · Selected" : ""}
                  </div>
                  {paper.description ? <div style={{ fontSize: 12 }}>{paper.description}</div> : null}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => setSelectedPaperId(paper.id)}
                  >
                    Select
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => onEditPaper(paper)}
                  >
                    Edit
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    style={{ width: "auto" }}
                    onClick={() => void onArchivePaper(paper)}
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isCompetitionCourseMode ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <h3 style={{ margin: 0 }}>Blueprints</h3>
              <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
                Manage generation rules for the selected paper.
              </p>
            </div>
            <button
              className="button secondary"
              type="button"
              style={{ width: "auto" }}
              disabled={!selectedPaperId}
              onClick={() => {
                setBlueprintEditingId("");
                setBlueprintForm({
                  title: "",
                  version: "1",
                  status: "DRAFT",
                  totalQuestions: "",
                  totalMarks: "",
                  durationMinutes: "",
                  difficultyDistribution: "{}",
                  categoryDistribution: "{}",
                  operationDistribution: "{}",
                  mandatoryQuestionIds: "[]",
                  randomizeQuestions: false,
                  randomizeOptions: false,
                  instructions: "",
                  sortOrder: "0"
                });
              }}
            >
              New Blueprint
            </button>
          </div>

          {!selectedPaperId ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>Select a paper to manage blueprints.</div>
          ) : null}

          {blueprintsError ? <div className="error">{blueprintsError}</div> : null}

          {selectedPaperId ? (
            <form onSubmit={onSaveBlueprint} style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 120px 160px 120px" }}>
                <label>
                  Title
                  <input className="input" value={blueprintForm.title} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, title: event.target.value }))} />
                </label>
                <label>
                  Version
                  <input className="input" inputMode="numeric" value={blueprintForm.version} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, version: event.target.value }))} />
                </label>
                <label>
                  Status
                  <select className="select" value={blueprintForm.status} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, status: event.target.value }))}>
                    <option value="DRAFT">Draft</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
                <label>
                  Sort Order
                  <input className="input" inputMode="numeric" value={blueprintForm.sortOrder} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
                </label>
                <label>
                  Total Questions
                  <input className="input" inputMode="numeric" value={blueprintForm.totalQuestions} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, totalQuestions: event.target.value }))} />
                </label>
                <label>
                  Total Marks
                  <input className="input" inputMode="numeric" value={blueprintForm.totalMarks} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, totalMarks: event.target.value }))} />
                </label>
                <label>
                  Duration Minutes
                  <input className="input" inputMode="numeric" value={blueprintForm.durationMinutes} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, durationMinutes: event.target.value }))} />
                </label>
                <label>
                  Randomize Questions
                  <select className="select" value={blueprintForm.randomizeQuestions ? "true" : "false"} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, randomizeQuestions: event.target.value === "true" }))}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
                <label>
                  Randomize Options
                  <select className="select" value={blueprintForm.randomizeOptions ? "true" : "false"} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, randomizeOptions: event.target.value === "true" }))}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Instructions
                  <textarea className="input" style={{ minHeight: 88, resize: "vertical" }} value={blueprintForm.instructions} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, instructions: event.target.value }))} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Difficulty Distribution JSON
                  <textarea className="input" style={{ minHeight: 88, resize: "vertical" }} value={blueprintForm.difficultyDistribution} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, difficultyDistribution: event.target.value }))} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Category Distribution JSON
                  <textarea className="input" style={{ minHeight: 88, resize: "vertical" }} value={blueprintForm.categoryDistribution} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, categoryDistribution: event.target.value }))} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Operation Distribution JSON
                  <textarea className="input" style={{ minHeight: 88, resize: "vertical" }} value={blueprintForm.operationDistribution} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, operationDistribution: event.target.value }))} />
                </label>
                <label style={{ gridColumn: "1 / -1" }}>
                  Mandatory Question IDs JSON
                  <textarea className="input" style={{ minHeight: 88, resize: "vertical" }} value={blueprintForm.mandatoryQuestionIds} onChange={(event) => setBlueprintForm((prev) => ({ ...prev, mandatoryQuestionIds: event.target.value }))} />
                </label>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button className="button" type="submit" style={{ width: "auto" }} disabled={blueprintSaving}>
                  {blueprintSaving ? (blueprintEditingId ? "Saving..." : "Creating...") : (blueprintEditingId ? "Save Blueprint" : "Add Blueprint")}
                </button>
                {blueprintEditingId ? (
                  <button
                    type="button"
                    className="button secondary"
                    style={{ width: "auto" }}
                    onClick={() => {
                      setBlueprintEditingId("");
                      setBlueprintForm({
                        title: "",
                        version: "1",
                        status: "DRAFT",
                        totalQuestions: "",
                        totalMarks: "",
                        durationMinutes: "",
                        difficultyDistribution: "{}",
                        categoryDistribution: "{}",
                        operationDistribution: "{}",
                        mandatoryQuestionIds: "[]",
                        randomizeQuestions: false,
                        randomizeOptions: false,
                        instructions: "",
                        sortOrder: "0"
                      });
                    }}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          ) : null}

          <div style={{ display: "grid", gap: 8 }}>
            {blueprintsLoading ? <div style={{ fontSize: 13, opacity: 0.75 }}>Loading blueprints...</div> : null}
            {!blueprintsLoading && selectedPaperId && !blueprints.length ? (
              <div style={{ fontSize: 13, opacity: 0.75 }}>No blueprints yet. Add one for the selected paper.</div>
            ) : null}
            {blueprints.map((blueprint) => (
              <div key={blueprint.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", border: "1px solid var(--color-border)", borderRadius: 8, padding: 10 }}>
                <div style={{ display: "grid", gap: 3 }}>
                  <div style={{ fontWeight: 700 }}>
                    {blueprint.title} · v{blueprint.version}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                    {blueprint.status} · Sort {blueprint.sortOrder}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Q: {blueprint.totalQuestions ?? "-"} · Marks: {blueprint.totalMarks ?? "-"} · Minutes: {blueprint.durationMinutes ?? "-"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => onEditBlueprint(blueprint)}>
                    Edit
                  </button>
                  <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => void onArchiveBlueprint(blueprint)}>
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {isCompetitionCourseMode ? (
        <div className="card" style={{ display: "grid", gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Generate Worksheet</h3>
            <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
              Generate a draft worksheet from the selected paper's active blueprint.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1.2fr 1.2fr 1fr 1fr" }}>
            <label>
              Paper
              <input className="input" value={selectedPaper?.title || selectedPaper?.code || "Select a paper above"} readOnly />
            </label>
            <label>
              Active Blueprint
              <select
                className="select"
                value={worksheetGenerationForm.blueprintId}
                onChange={(event) => setWorksheetGenerationForm((prev) => ({ ...prev, blueprintId: event.target.value }))}
                disabled={!selectedPaperId || !activeBlueprints.length}
              >
                <option value="">Select blueprint</option>
                {activeBlueprints.map((blueprint) => (
                  <option key={blueprint.id} value={blueprint.id}>
                    {blueprint.title} · v{blueprint.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Version
              <input
                className="input"
                value={worksheetGenerationForm.version}
                onChange={(event) => setWorksheetGenerationForm((prev) => ({ ...prev, version: event.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label>
              Seed
              <input
                className="input"
                value={worksheetGenerationForm.seed}
                onChange={(event) => setWorksheetGenerationForm((prev) => ({ ...prev, seed: event.target.value }))}
                placeholder="Optional"
              />
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Worksheet Title
              <input
                className="input"
                value={worksheetGenerationForm.title}
                onChange={(event) => setWorksheetGenerationForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Draft worksheet title"
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="button" type="button" style={{ width: "auto" }} disabled={worksheetGenerating || !selectedPaperId || !worksheetGenerationForm.blueprintId} onClick={onGenerateWorksheetFromBlueprint}>
              {worksheetGenerating ? "Generating..." : "Generate Worksheet"}
            </button>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
              Uses the level question bank only and creates a fresh draft worksheet.
            </div>
          </div>
        </div>
      ) : null}

      {!isCompetitionCourseMode ? <div className="card" style={{ display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Worksheet Template</h3>
        {templateError ? <div className="error">{templateError}</div> : null}
        <form onSubmit={onSaveTemplate} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Name
              <input className="input" value={templateForm.name} onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))} />
            </label>
            <label>
              Time Limit (seconds)
              <input
                className="input"
                inputMode="numeric"
                value={templateForm.timeLimitSeconds}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, timeLimitSeconds: event.target.value }))}
              />
            </label>
            <label>
              Total Questions
              <input
                className="input"
                inputMode="numeric"
                value={templateForm.totalQuestions}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, totalQuestions: event.target.value }))}
              />
            </label>
            <label>
              Active
              <select
                className="select"
                value={templateForm.isActive ? "true" : "false"}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, isActive: event.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Easy
              <input className="input" inputMode="numeric" value={templateForm.easyCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, easyCount: event.target.value }))} />
            </label>
            <label>
              Medium
              <input className="input" inputMode="numeric" value={templateForm.mediumCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, mediumCount: event.target.value }))} />
            </label>
            <label>
              Hard
              <input className="input" inputMode="numeric" value={templateForm.hardCount} onChange={(event) => setTemplateForm((prev) => ({ ...prev, hardCount: event.target.value }))} />
            </label>
          </div>

          <button className="button" type="submit" style={{ width: "auto" }} disabled={templateSaving}>
            {templateSaving ? "Saving..." : template ? "Update Template" : "Create Template"}
          </button>
        </form>
      </div> : null}

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0 }}>
          Worksheets{isCompetitionCourseMode ? ` · ${selectedPaper ? selectedPaper.title : "Level Scope"}` : ""}
        </h3>
        {isCompetitionCourseMode ? (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {selectedPaper ? "Paper-scoped worksheets." : "Legacy level-scoped worksheets."}
          </div>
        ) : null}
        {worksheetsError ? <div className="error">{worksheetsError}</div> : null}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 160px 160px 130px" }}>
          <label>
            Search
            <input
              className="input"
              placeholder="Title or description"
              value={worksheetsQ}
              onChange={(event) => setWorksheetsQ(event.target.value)}
            />
          </label>
          <label>
            Published
            <select className="select" value={worksheetsPublished} onChange={(event) => setWorksheetsPublished(event.target.value)}>
              <option value="">All</option>
              <option value="true">Published</option>
              <option value="false">Draft</option>
            </select>
          </label>
          <label>
            Difficulty
            <select className="select" value={worksheetsDifficulty} onChange={(event) => setWorksheetsDifficulty(event.target.value)}>
              <option value="">All</option>
              <option value="EASY">EASY</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HARD">HARD</option>
            </select>
          </label>
          <label>
            Per Page
            <select
              className="select"
              value={String(worksheetsLimit)}
              onChange={(event) => {
                const nextLimit = Number(event.target.value);
                void loadWorksheets(worksheetScopeId, { limit: nextLimit, offset: 0 });
              }}
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
              <option value="40">40</option>
              <option value="50">50</option>
            </select>
          </label>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => void loadWorksheets(worksheetScopeId, { offset: 0 })}
            disabled={worksheetsLoading}
          >
            {worksheetsLoading ? "Loading..." : "Apply Filters"}
          </button>
          <button
            className="button secondary"
            type="button"
            style={{ width: "auto" }}
            onClick={() => {
              setWorksheetsQ("");
              setWorksheetsPublished("");
              setWorksheetsDifficulty("");
              void loadWorksheets(worksheetScopeId, { q: "", published: "", difficulty: "", offset: 0 });
            }}
          >
            Reset Filters
          </button>
        </div>

        <form onSubmit={onCreateWorksheet} style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            New worksheets are created as draft. Publish after adding questions from Worksheet Details.
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
            <label>
              Title
              <input className="input" value={worksheetCreateForm.title} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, title: event.target.value }))} />
            </label>
            <label>
              Difficulty
              <select className="select" value={worksheetCreateForm.difficulty} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, difficulty: event.target.value }))}>
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              Description
              <input className="input" value={worksheetCreateForm.description} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, description: event.target.value }))} />
            </label>
            <label>
              Publish
              <select className="select" value={worksheetCreateForm.isPublished ? "true" : "false"} onChange={(event) => setWorksheetCreateForm((prev) => ({ ...prev, isPublished: event.target.value === "true" }))}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </label>
          </div>

          <button className="button" type="submit" style={{ width: "auto" }} disabled={worksheetCreating}>
            {worksheetCreating ? "Creating..." : "Create Worksheet"}
          </button>
        </form>

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 2fr" }}>
          <div>
            {worksheetsLoading ? <LoadingState label="Loading worksheets..." /> : null}
            <div style={{ display: "grid", gap: 8 }}>
              {worksheets.map((worksheet) => (
                <button
                  key={worksheet.id}
                  type="button"
                  className={worksheet.id === selectedWorksheetId ? "button" : "button secondary"}
                  style={{ width: "100%", textAlign: "left" }}
                  onClick={() => setSelectedWorksheetId(worksheet.id)}
                >
                  {worksheet.title}
                </button>
              ))}
            </div>

            <PaginationBar
              limit={worksheetsLimit}
              offset={worksheetsOffset}
              count={worksheets.length}
              onChange={(next) => {
                void loadWorksheets(worksheetScopeId, next);
              }}
            />
          </div>

          <div>
            {!selectedWorksheetId ? (
              <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Select a worksheet to build and preview.</div>
            ) : worksheetLoading ? (
              <LoadingState label="Loading worksheet..." />
            ) : worksheetError ? (
              <ErrorState title="Worksheet error" message={worksheetError} onRetry={() => loadWorksheet(selectedWorksheetId)} />
            ) : selectedWorksheet ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedWorksheet.title}</div>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Drag-drop questions to reorder, then save.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="button secondary" type="button" style={{ width: "auto" }} onClick={onSaveOrder} disabled={!dirtyOrder}>
                      Save Order
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => setDuplicateWorksheetTarget(selectedWorksheet)}
                    >
                      Regenerate as New Draft
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      style={{ width: "auto" }}
                      onClick={() => setDeleteWorksheetTarget(selectedWorksheet)}
                    >
                      Delete Worksheet
                    </button>
                  </div>
                </div>

                <div className="card" style={{ display: "grid", gap: 10, borderColor: "var(--color-border)" }}>
                  <div style={{ fontWeight: 700 }}>Worksheet Details</div>
                  <form onSubmit={onSaveWorksheetMeta} style={{ display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
                      <label>
                        Title
                        <input
                          className="input"
                          value={worksheetMetaForm.title}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, title: event.target.value }))}
                        />
                      </label>
                      <label>
                        Difficulty
                        <select
                          className="select"
                          value={worksheetMetaForm.difficulty}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, difficulty: event.target.value }))}
                        >
                          <option value="EASY">EASY</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HARD">HARD</option>
                        </select>
                      </label>
                      <label style={{ gridColumn: "1 / -1" }}>
                        Description
                        <input
                          className="input"
                          value={worksheetMetaForm.description}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, description: event.target.value }))}
                        />
                      </label>
                      <label>
                        Publish
                        <select
                          className="select"
                          value={worksheetMetaForm.isPublished ? "true" : "false"}
                          onChange={(event) => setWorksheetMetaForm((prev) => ({ ...prev, isPublished: event.target.value === "true" }))}
                        >
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </label>
                    </div>

                    <button className="button" type="submit" style={{ width: "auto" }} disabled={worksheetMetaSaving}>
                      {worksheetMetaSaving ? "Saving..." : "Save Details"}
                    </button>
                  </form>
                </div>

                <div className="card" style={{ display: "grid", gap: 10, borderColor: "var(--color-border)" }}>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end" }}>
                    <label style={{ display: "grid", gap: 6, minWidth: 260 }}>
                      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Add from Question Bank</span>
                      <select className="select" value={questionAddBankId} onChange={(event) => setQuestionAddBankId(event.target.value)}>
                        <option value="">Select question…</option>
                        {bankItems.map((question) => (
                          <option key={question.id} value={question.questionBankId || question.id}>
                            {question.difficulty}: {question.prompt}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button" type="button" style={{ width: "auto" }} onClick={onAddQuestionToWorksheet} disabled={!questionAddBankId || questionAdding || bankLoading}>
                      {questionAdding ? "Adding..." : "Add"}
                    </button>
                  </div>

                  <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Bulk Add from Question Bank</div>
                    <div style={{ maxHeight: 180, overflow: "auto", border: "1px solid var(--color-border)", borderRadius: 8, padding: 8 }}>
                      {bankItems.map((question) => {
                        const sourceQuestionBankId = question.questionBankId || question.id;
                        const checked = bulkQuestionIds.includes(sourceQuestionBankId);
                        return (
                          <label key={question.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) => {
                                const nextChecked = event.target.checked;
                                setBulkQuestionIds((prev) => {
                                  if (nextChecked) {
                                    if (prev.includes(sourceQuestionBankId)) {
                                      return prev;
                                    }
                                    return [...prev, sourceQuestionBankId];
                                  }
                                  return prev.filter((id) => id !== sourceQuestionBankId);
                                });
                              }}
                            />
                            <span style={{ fontSize: 13 }}>{question.difficulty}: {question.prompt}</span>
                          </label>
                        );
                      })}
                      {!bankItems.length ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>No question bank entries available.</div> : null}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="button"
                        type="button"
                        style={{ width: "auto" }}
                        onClick={onAddBulkQuestions}
                        disabled={!bulkQuestionIds.length || bulkAdding || bankLoading}
                      >
                        {bulkAdding ? "Adding Selected..." : `Add Selected (${bulkQuestionIds.length})`}
                      </button>
                      <button
                        className="button secondary"
                        type="button"
                        style={{ width: "auto" }}
                        onClick={() => setBulkQuestionIds([])}
                        disabled={!bulkQuestionIds.length || bulkAdding}
                      >
                        Clear Selection
                      </button>
                    </div>
                  </div>
                </div>

                <div className="card" style={{ display: "grid", gap: 8 }} aria-label="Worksheet builder">
                  {(selectedWorksheet.questions || []).length === 0 ? (
                    <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No questions yet. Add from question bank.</div>
                  ) : (
                    (selectedWorksheet.questions || []).map((question) => (
                      <div
                        key={question.id}
                        draggable
                        onDragStart={() => {
                          dragIdRef.current = question.id;
                        }}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          const fromId = dragIdRef.current;
                          dragIdRef.current = null;
                          moveQuestion(fromId, question.id);
                        }}
                        style={{
                          padding: 10,
                          border: "1px solid var(--color-border)",
                          borderRadius: 10,
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "flex-start",
                          flexWrap: "wrap"
                        }}
                      >
                        <div style={{ minWidth: 0, flex: "1 1 280px" }}>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>#{question.questionNumber}</div>
                          <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{formatWorksheetQuestionPreview(question)}</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Drag</div>
                          <button
                            className="button secondary"
                            type="button"
                            style={{ width: "auto" }}
                            onClick={() => setDeleteQuestionTarget(question)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="card" style={{ display: "grid", gap: 8 }} aria-label="Preview">
                  <div style={{ fontWeight: 700 }}>Preview</div>
                  {(selectedWorksheet.questions || []).map((question) => (
                    <div key={question.id} style={{ display: "flex", gap: 10 }}>
                      <div style={{ width: 28, color: "var(--color-text-muted)" }}>{question.questionNumber}.</div>
                      <div style={{ overflowWrap: "anywhere" }}>{formatWorksheetQuestionPreview(question)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleteWorksheetTarget)}
        title="Delete Worksheet"
        message="Are you sure you want to delete this worksheet? This will remove its questions and submissions."
        confirmLabel="Delete"
        onConfirm={async () => {
          const target = deleteWorksheetTarget;
          setDeleteWorksheetTarget(null);
          if (!target) {
            return;
          }

          try {
            await deleteWorksheet(target.id);
            if (selectedWorksheetId === target.id) {
              setSelectedWorksheetId(null);
              setSelectedWorksheet(null);
            }
            await loadWorksheets(worksheetScopeId);
          } catch (err) {
            setWorksheetError(getFriendlyErrorMessage(err) || "Failed to delete worksheet.");
          }
        }}
        onCancel={() => setDeleteWorksheetTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(deleteQuestionTarget)}
        title="Remove Question"
        message="Remove this question from worksheet?"
        confirmLabel="Remove"
        onConfirm={async () => {
          const target = deleteQuestionTarget;
          setDeleteQuestionTarget(null);
          if (!target || !selectedWorksheet?.id) {
            return;
          }

          try {
            await deleteWorksheetQuestion(selectedWorksheet.id, target.id);
            await loadWorksheet(selectedWorksheet.id);
            await loadWorksheets(worksheetScopeId);
          } catch (err) {
            setWorksheetError(getFriendlyErrorMessage(err) || "Failed to remove question.");
          }
        }}
        onCancel={() => setDeleteQuestionTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(duplicateWorksheetTarget)}
        title="Duplicate Worksheet"
        message="Create a copy of this worksheet as draft with all its questions?"
        confirmLabel="Duplicate"
        onConfirm={onDuplicateWorksheet}
        onCancel={() => setDuplicateWorksheetTarget(null)}
      />
    </section>
  );
}

export { SuperadminCourseLevelWorksheetsPage };
