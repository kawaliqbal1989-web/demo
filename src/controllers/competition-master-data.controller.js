import { asyncHandler } from "../utils/async-handler.js";
import {
  addCourseLevel as addCourseLevelService,
  archiveCourse as archiveCourseService,
  restoreCourse as restoreCourseService,
  archiveQuestionBank as archiveQuestionBankService,
  archiveCompetitionWorksheet as archiveCompetitionWorksheetService,
  archiveSeason as archiveSeasonService,
  createCourse as createCourseService,
  copyCompetitionResources as copyCompetitionResourcesService,
  createQuestionBank as createQuestionBankService,
  createCompetitionQuestionBankQuestion as createCompetitionQuestionBankQuestionService,
  importCompetitionQuestionBankQuestions as importCompetitionQuestionBankQuestionsService,
  updateCompetitionQuestionBankQuestion as updateCompetitionQuestionBankQuestionService,
  removeCompetitionQuestionBankQuestion as removeCompetitionQuestionBankQuestionService,
  createCompetitionWorksheet as createCompetitionWorksheetService,
  buildCompetitionWorksheetFromQuestions as buildCompetitionWorksheetFromQuestionsService,
  createSeason as createSeasonService,
  getCourse as getCourseService,
  getQuestionBank as getQuestionBankService,
  getCompetitionWorksheet as getCompetitionWorksheetService,
  getSeason as getSeasonService,
  listCourseLevels as listCourseLevelsService,
  listCourses as listCoursesService,
  listCompetitionReuseSources as listCompetitionReuseSourcesService,
  listQuestionBanks as listQuestionBanksService,
  listCompetitionQuestionBankQuestions as listCompetitionQuestionBankQuestionsService,
  listCompetitionWorksheets as listCompetitionWorksheetsService,
  listCompetitionWorksheetAssignments as listCompetitionWorksheetAssignmentsService,
  listSeasons as listSeasonsService,
  removeCourseLevel as removeCourseLevelService,
  reorderCourseLevels as reorderCourseLevelsService,
  replaceCompetitionWorksheetAssignments as replaceCompetitionWorksheetAssignmentsService,
  updateCourse as updateCourseService,
  updateQuestionBank as updateQuestionBankService,
  updateCompetitionWorksheet as updateCompetitionWorksheetService,
  updateSeason as updateSeasonService
} from "../services/competition-master-data.service.js";
import {
  validateCompetitionWorksheetPayload,
  validateCoursePayload,
  validateLevelPayload,
  validateLevelReorderPayload,
  validateQuestionBankPayload,
  validateCompetitionReusePayload,
  validateSeasonPayload
} from "../services/competition-master-data.validation.js";
import { synchronizeDeferredCompetitionWorksheetAssignments } from "../services/competition-enrollment-workflow.service.js";

const listSeasons = asyncHandler(async (req, res) => {
  const result = await listSeasonsService({ tenantId: req.auth.tenantId, query: req.query });
  return res.apiSuccess("Competition seasons fetched", result);
});

const createSeason = asyncHandler(async (req, res) => {
  const data = validateSeasonPayload(req.body);
  const item = await createSeasonService({ tenantId: req.auth.tenantId, userId: req.auth.userId, data });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition season created", item, 201);
});

const getSeason = asyncHandler(async (req, res) => {
  const item = await getSeasonService({ tenantId: req.auth.tenantId, seasonId: req.params.seasonId });
  return res.apiSuccess("Competition season fetched", item);
});

const updateSeason = asyncHandler(async (req, res) => {
  const data = validateSeasonPayload(req.body, { partial: true });
  const item = await updateSeasonService({ tenantId: req.auth.tenantId, seasonId: req.params.seasonId, data });
  return res.apiSuccess("Competition season updated", item);
});

const archiveSeason = asyncHandler(async (req, res) => {
  const item = await archiveSeasonService({ tenantId: req.auth.tenantId, seasonId: req.params.seasonId });
  return res.apiSuccess("Competition season archived", item);
});

const listCourses = asyncHandler(async (req, res) => {
  const result = await listCoursesService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, query: req.query });
  return res.apiSuccess("Competition courses fetched", result);
});

const createCourse = asyncHandler(async (req, res) => {
  const data = validateCoursePayload(req.body);
  const item = await createCourseService({ tenantId: req.auth.tenantId, userId: req.auth.userId, competitionId: req.params.competitionId, data });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition course created", item, 201);
});

const listCompetitionReuseSources = asyncHandler(async (req, res) => {
  const items = await listCompetitionReuseSourcesService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId
  });
  return res.apiSuccess("Competition reuse sources fetched", items);
});

const copyCompetitionResources = asyncHandler(async (req, res) => {
  const data = validateCompetitionReusePayload(req.body);
  const result = await copyCompetitionResourcesService({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    competitionId: req.params.competitionId,
    ...data
  });
  res.locals.entityId = req.params.competitionId;
  return res.apiSuccess("Competition resources copied", result, 201);
});

const getCourse = asyncHandler(async (req, res) => {
  const item = await getCourseService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId });
  return res.apiSuccess("Competition course fetched", item);
});

const updateCourse = asyncHandler(async (req, res) => {
  const data = validateCoursePayload(req.body, { partial: true });
  const item = await updateCourseService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId, data });
  return res.apiSuccess("Competition course updated", item);
});

const archiveCourse = asyncHandler(async (req, res) => {
  const item = await archiveCourseService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId });
  return res.apiSuccess("Competition course archived", item);
});
const restoreCourse = asyncHandler(async (req, res) => {
  const item = await restoreCourseService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId
  });

  return res.apiSuccess("Competition course restored", item);
});

const listCourseLevels = asyncHandler(async (req, res) => {
  const items = await listCourseLevelsService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    includeInactive: String(req.query.includeInactive || "").toLowerCase() === "true"
  });
  return res.apiSuccess("Competition course levels fetched", items);
});

const addCourseLevel = asyncHandler(async (req, res) => {
  const data = validateLevelPayload(req.body);
  const item = await addCourseLevelService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId, ...data });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition course level added", item, 201);
});

const removeCourseLevel = asyncHandler(async (req, res) => {
  const item = await removeCourseLevelService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId, courseLevelId: req.params.courseLevelId });
  return res.apiSuccess("Competition course level removed", item);
});

const reorderCourseLevels = asyncHandler(async (req, res) => {
  const { orderedLevelIds } = validateLevelReorderPayload(req.body);
  const items = await reorderCourseLevelsService({ tenantId: req.auth.tenantId, competitionId: req.params.competitionId, courseId: req.params.courseId, orderedLevelIds });
  return res.apiSuccess("Competition course levels reordered", items);
});


const listQuestionBanks = asyncHandler(async (req, res) => {
  const result = await listQuestionBanksService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    query: req.query
  });
  return res.apiSuccess("Competition question banks fetched", result);
});

const createQuestionBank = asyncHandler(async (req, res) => {
  const data = validateQuestionBankPayload(req.body);
  const item = await createQuestionBankService({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    data
  });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition question bank created", item, 201);
});

const getQuestionBank = asyncHandler(async (req, res) => {
  const item = await getQuestionBankService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId
  });
  return res.apiSuccess("Competition question bank fetched", item);
});

const updateQuestionBank = asyncHandler(async (req, res) => {
  const data = validateQuestionBankPayload(req.body, { partial: true });
  const item = await updateQuestionBankService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    data
  });
  return res.apiSuccess("Competition question bank updated", item);
});

const archiveQuestionBank = asyncHandler(async (req, res) => {
  const item = await archiveQuestionBankService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId
  });
  return res.apiSuccess("Competition question bank archived", item);
});


const listCompetitionQuestionBankQuestions = asyncHandler(async (req, res) => {
  const result = await listCompetitionQuestionBankQuestionsService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    query: req.query
  });
  return res.apiSuccess("Competition question bank questions fetched", result);
});

const createCompetitionQuestionBankQuestion = asyncHandler(async (req, res) => {
  const item = await createCompetitionQuestionBankQuestionService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    data: req.body || {}
  });
  res.locals.entityId = item.questionBankId;
  return res.apiSuccess("Competition question created", item, 201);
});

const importCompetitionQuestionBankQuestions = asyncHandler(async (req, res) => {
  const created = await importCompetitionQuestionBankQuestionsService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    questions: req.body?.questions
  });
  res.locals.entityId = req.params.questionBankId;
  return res.apiSuccess("Competition questions imported", {
    importedCount: created.length,
    items: created
  }, 201);
});

const updateCompetitionQuestionBankQuestion = asyncHandler(async (req, res) => {
  const item = await updateCompetitionQuestionBankQuestionService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    questionId: req.params.questionId,
    data: req.body || {}
  });
  return res.apiSuccess("Competition question updated", item);
});

const removeCompetitionQuestionBankQuestion = asyncHandler(async (req, res) => {
  const result = await removeCompetitionQuestionBankQuestionService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    questionId: req.params.questionId
  });
  return res.apiSuccess("Question removed from Competition question bank", result);
});


const listCompetitionWorksheets = asyncHandler(async (req, res) => {
  const result = await listCompetitionWorksheetsService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    query: req.query
  });
  return res.apiSuccess("Competition worksheets fetched", result);
});


const buildCompetitionWorksheetFromQuestions = asyncHandler(async (req, res) => {
  const item = await buildCompetitionWorksheetFromQuestionsService({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    data: req.body || {}
  });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition Worksheet built from selected questions", item, 201);
});

const createCompetitionWorksheet = asyncHandler(async (req, res) => {
  const data = validateCompetitionWorksheetPayload(req.body);
  const item = await createCompetitionWorksheetService({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    data
  });
  res.locals.entityId = item.id;
  return res.apiSuccess("Competition worksheet created", item, 201);
});

const getCompetitionWorksheet = asyncHandler(async (req, res) => {
  const item = await getCompetitionWorksheetService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    worksheetId: req.params.worksheetId
  });
  return res.apiSuccess("Competition worksheet fetched", item);
});

const updateCompetitionWorksheet = asyncHandler(async (req, res) => {
  const data = validateCompetitionWorksheetPayload(req.body, { partial: true });
  const item = await updateCompetitionWorksheetService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    worksheetId: req.params.worksheetId,
    data
  });
  return res.apiSuccess("Competition worksheet updated", item);
});

const archiveCompetitionWorksheet = asyncHandler(async (req, res) => {
  const item = await archiveCompetitionWorksheetService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    worksheetId: req.params.worksheetId
  });
  return res.apiSuccess("Competition worksheet archived", item);
});


const listCompetitionWorksheetAssignments = asyncHandler(async (req, res) => {
  const items = await listCompetitionWorksheetAssignmentsService({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    worksheetId: req.params.worksheetId
  });
  return res.apiSuccess("Competition worksheet assignments fetched", items);
});

const replaceCompetitionWorksheetAssignments = asyncHandler(async (req, res) => {
  if (!Array.isArray(req.body?.businessPartnerIds)) {
    const error = new Error("businessPartnerIds must be an array");
    error.statusCode = 400;
    error.errorCode = "COMPETITION_WORKSHEET_BP_IDS_REQUIRED";
    throw error;
  }

  const businessPartnerIds = req.body.businessPartnerIds
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const items = await replaceCompetitionWorksheetAssignmentsService({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    competitionId: req.params.competitionId,
    courseId: req.params.courseId,
    courseLevelId: req.params.courseLevelId,
    questionBankId: req.params.questionBankId,
    worksheetId: req.params.worksheetId,
    businessPartnerIds
  });
  const synchronization = await synchronizeDeferredCompetitionWorksheetAssignments({
    tenantId: req.auth.tenantId,
    competitionId: req.params.competitionId,
    competitionCourseLevelId: req.params.courseLevelId,
    businessPartnerIds,
    actorUserId: req.auth.userId
  });
  res.locals.entityId = req.params.worksheetId;
  res.locals.auditMetadata = { deferredWorksheetSynchronization: synchronization };
  return res.apiSuccess(
    `Competition worksheet assignments updated; ${synchronization.worksheetAssignmentCount} approved participation ID(s) synchronized`,
    items
  );
});

export {
  addCourseLevel,
  archiveCourse,
  restoreCourse,
  archiveQuestionBank,
  archiveCompetitionWorksheet,
  archiveSeason,
  createCourse,
  copyCompetitionResources,
  createQuestionBank,
  createCompetitionQuestionBankQuestion,
  importCompetitionQuestionBankQuestions,
  updateCompetitionQuestionBankQuestion,
  removeCompetitionQuestionBankQuestion,
  createCompetitionWorksheet,
  buildCompetitionWorksheetFromQuestions,
  createSeason,
  getCourse,
  getQuestionBank,
  getCompetitionWorksheet,
  getSeason,
  listCourseLevels,
  listCourses,
  listCompetitionReuseSources,
  listQuestionBanks,
  listCompetitionQuestionBankQuestions,
  listCompetitionWorksheets,
  listCompetitionWorksheetAssignments,
  listSeasons,
  removeCourseLevel,
  reorderCourseLevels,
  replaceCompetitionWorksheetAssignments,
  updateCourse,
  updateQuestionBank,
  updateCompetitionWorksheet,
  updateSeason
};
