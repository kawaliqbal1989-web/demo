import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ensureExamPlatformTables } from "../services/exam-platform-db.service.js";

function cuidLike(prefix = "ep") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toDecimal(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeQuestionType(value) {
  const type = String(value || "").trim().toUpperCase();
  const allowed = ["MCQ", "TRUE_FALSE", "FILL_IN_BLANK", "SHORT_ANSWER", "LONG_ANSWER", "ABACUS_PRACTICAL"];
  return allowed.includes(type) ? type : null;
}

function gradeByPercent(percent) {
  if (percent >= 90) return "A+";
  if (percent >= 80) return "A";
  if (percent >= 70) return "B";
  if (percent >= 60) return "C";
  if (percent >= 50) return "D";
  return "F";
}

async function safeCount(sql, ...params) {
  try {
    const rows = await prisma.$queryRawUnsafe(sql, ...params);
    return Number(rows?.[0]?.c || 0);
  } catch {
    return 0;
  }
}

const listExamPlatformAudit = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const [
    subjects,
    platformQuestions,
    platformExams,
    platformAttempts,
    platformResults,
    platformCompetitions,
    platformCertificates,
    legacyQuestions,
    legacyExams,
    legacyAttempts,
    legacyResults,
    legacyCompetitions,
    legacyCertificates
  ] = await Promise.all([
    safeCount("SELECT COUNT(*) AS c FROM exam_subject WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_question_bank WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_builder WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_attempt WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_result WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM competition_builder WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_certificate WHERE tenant_id = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM questionbank WHERE tenantId = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM examcycle WHERE tenantId = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM worksheetsubmission WHERE tenantId = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM worksheetsubmission WHERE tenantId = ? AND status = 'REVIEWED'", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM competition WHERE tenantId = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM certificate WHERE tenantId = ?", req.auth.tenantId)
  ]);

  return res.apiSuccess("Exam platform audit", {
    subjects,
    questions: platformQuestions + legacyQuestions,
    exams: platformExams + legacyExams,
    attempts: platformAttempts + legacyAttempts,
    results: platformResults + legacyResults,
    competitions: platformCompetitions + legacyCompetitions,
    certificates: platformCertificates + legacyCertificates
  });
});

const listSubjects = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, name, code, description, is_archived AS isArchived, created_at AS createdAt, updated_at AS updatedAt FROM exam_subject WHERE tenant_id = ? ORDER BY created_at DESC",
    req.auth.tenantId
  );
  return res.apiSuccess("Subjects fetched", { items: rows });
});

const createSubject = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || name.replace(/\s+/g, "_").toUpperCase()).trim();
  const description = req.body.description ? String(req.body.description) : null;

  if (!name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  const id = cuidLike("sub");
  await prisma.$executeRawUnsafe(
    "INSERT INTO exam_subject (id, tenant_id, name, code, description) VALUES (?, ?, ?, ?, ?)",
    id,
    req.auth.tenantId,
    name,
    code,
    description
  );

  return res.apiSuccess("Subject created", { id, name, code, description }, 201);
});

const updateSubject = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  const name = req.body.name === undefined ? null : String(req.body.name || "").trim();
  const code = req.body.code === undefined ? null : String(req.body.code || "").trim();
  const description = req.body.description === undefined ? null : String(req.body.description || "").trim();
  const isArchived = req.body.isArchived === undefined ? null : req.body.isArchived ? 1 : 0;

  await prisma.$executeRawUnsafe(
    `UPDATE exam_subject
     SET name = COALESCE(?, name),
         code = COALESCE(?, code),
         description = COALESCE(?, description),
         is_archived = COALESCE(?, is_archived)
     WHERE tenant_id = ? AND id = ?`,
    name,
    code,
    description,
    isArchived,
    req.auth.tenantId,
    id
  );

  return res.apiSuccess("Subject updated", { id });
});

const deleteSubject = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  await prisma.$executeRawUnsafe("DELETE FROM exam_subject WHERE tenant_id = ? AND id = ?", req.auth.tenantId, id);
  return res.apiSuccess("Subject deleted", { id });
});

const listQuestionBankV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const levelId = req.query.levelId ? String(req.query.levelId) : null;
  const subjectId = req.query.subjectId ? String(req.query.subjectId) : null;
  const topic = req.query.topic ? String(req.query.topic) : null;
  const difficultyId = req.query.difficultyId ? String(req.query.difficultyId) : null;
  const tag = req.query.tag ? String(req.query.tag) : null;
  const includeArchived = req.query.includeArchived === "true";

  let sql = `
    SELECT qb.id, qb.subject_id AS subjectId, qb.level_id AS levelId, qb.topic,
           qb.question_type AS questionType, qb.question_text AS questionText,
           qb.answer_text AS answerText, qb.metadata_json AS metadata,
           qb.is_archived AS isArchived, qb.created_at AS createdAt,
           s.name AS subjectName
    FROM exam_question_bank qb
    LEFT JOIN exam_subject s ON s.id = qb.subject_id AND s.tenant_id = qb.tenant_id
    WHERE qb.tenant_id = ?`;
  const params = [req.auth.tenantId];

  if (!includeArchived) {
    sql += " AND qb.is_archived = 0";
  }
  if (levelId) {
    sql += " AND qb.level_id = ?";
    params.push(levelId);
  }
  if (subjectId) {
    sql += " AND qb.subject_id = ?";
    params.push(subjectId);
  }
  if (topic) {
    sql += " AND qb.topic = ?";
    params.push(topic);
  }
  if (difficultyId) {
    sql += " AND qb.difficulty_id = ?";
    params.push(difficultyId);
  }
  if (tag) {
    sql += " AND EXISTS (SELECT 1 FROM exam_question_tag t WHERE t.tenant_id = qb.tenant_id AND t.name = ?)";
    params.push(tag);
  }

  sql += " ORDER BY qb.created_at DESC LIMIT 1000";
  const rows = await prisma.$queryRawUnsafe(sql, ...params);

  const questionIds = rows.map((row) => row.id);
  let optionsByQuestion = {};

  if (questionIds.length) {
    const options = await prisma.$queryRawUnsafe(
      `SELECT id, question_id AS questionId, option_label AS optionLabel, option_text AS optionText, is_correct AS isCorrect, sort_order AS sortOrder
       FROM exam_question_option
       WHERE tenant_id = ? AND question_id IN (${questionIds.map(() => "?").join(",")})
       ORDER BY sort_order ASC, created_at ASC`,
      req.auth.tenantId,
      ...questionIds
    );

    optionsByQuestion = options.reduce((acc, row) => {
      const key = row.questionId;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push({
        id: row.id,
        optionLabel: row.optionLabel,
        optionText: row.optionText,
        isCorrect: Boolean(row.isCorrect),
        sortOrder: row.sortOrder
      });
      return acc;
    }, {});
  }

  const items = rows.map((row) => ({
    ...row,
    isArchived: Boolean(row.isArchived),
    metadata: parseJson(row.metadata, {}),
    options: optionsByQuestion[row.id] || []
  }));

  return res.apiSuccess("Question bank fetched", { items });
});

const createQuestionBankV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const questionType = normalizeQuestionType(req.body.questionType);
  const questionText = String(req.body.questionText || "").trim();
  const subjectId = req.body.subjectId ? String(req.body.subjectId) : null;
  const levelId = req.body.levelId ? String(req.body.levelId) : null;
  const topic = req.body.topic ? String(req.body.topic) : null;
  const categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
  const difficultyId = req.body.difficultyId ? String(req.body.difficultyId) : null;
  const answerText = req.body.answerText ? String(req.body.answerText) : null;
  const metadata = JSON.stringify(parseJson(req.body.metadata, {}));
  const options = Array.isArray(req.body.options) ? req.body.options : [];

  if (!questionType || !questionText) {
    return res.apiError(400, "questionType and questionText are required", "VALIDATION_ERROR");
  }

  const id = cuidLike("q");

  await prisma.$executeRawUnsafe(
    `INSERT INTO exam_question_bank
      (id, tenant_id, owner_role, owner_user_id, subject_id, level_id, topic, category_id, difficulty_id, question_type, question_text, answer_text, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    req.auth.tenantId,
    req.auth.role,
    req.auth.userId,
    subjectId,
    levelId,
    topic,
    categoryId,
    difficultyId,
    questionType,
    questionText,
    answerText,
    metadata
  );

  for (const [idx, option] of options.entries()) {
    const optionText = String(option?.optionText || "").trim();
    if (!optionText) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_question_option (id, tenant_id, question_id, option_label, option_text, is_correct, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      cuidLike("opt"),
      req.auth.tenantId,
      id,
      option?.optionLabel ? String(option.optionLabel) : null,
      optionText,
      option?.isCorrect ? 1 : 0,
      idx + 1
    );
  }

  return res.apiSuccess("Question created", { id }, 201);
});

const updateQuestionBankV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);

  const questionType = req.body.questionType === undefined ? null : normalizeQuestionType(req.body.questionType);
  const questionText = req.body.questionText === undefined ? null : String(req.body.questionText || "").trim();
  const subjectId = req.body.subjectId === undefined ? null : String(req.body.subjectId || "").trim();
  const levelId = req.body.levelId === undefined ? null : String(req.body.levelId || "").trim();
  const topic = req.body.topic === undefined ? null : String(req.body.topic || "").trim();
  const answerText = req.body.answerText === undefined ? null : String(req.body.answerText || "").trim();
  const metadata = req.body.metadata === undefined ? null : JSON.stringify(parseJson(req.body.metadata, {}));

  await prisma.$executeRawUnsafe(
    `UPDATE exam_question_bank
     SET question_type = COALESCE(?, question_type),
         question_text = COALESCE(?, question_text),
         subject_id = COALESCE(?, subject_id),
         level_id = COALESCE(?, level_id),
         topic = COALESCE(?, topic),
         answer_text = COALESCE(?, answer_text),
         metadata_json = COALESCE(?, metadata_json)
     WHERE tenant_id = ? AND id = ?`,
    questionType,
    questionText,
    subjectId,
    levelId,
    topic,
    answerText,
    metadata,
    req.auth.tenantId,
    id
  );

  if (Array.isArray(req.body.options)) {
    await prisma.$executeRawUnsafe("DELETE FROM exam_question_option WHERE tenant_id = ? AND question_id = ?", req.auth.tenantId, id);

    for (const [idx, option] of req.body.options.entries()) {
      const optionText = String(option?.optionText || "").trim();
      if (!optionText) {
        continue;
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO exam_question_option (id, tenant_id, question_id, option_label, option_text, is_correct, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        cuidLike("opt"),
        req.auth.tenantId,
        id,
        option?.optionLabel ? String(option.optionLabel) : null,
        optionText,
        option?.isCorrect ? 1 : 0,
        idx + 1
      );
    }
  }

  return res.apiSuccess("Question updated", { id });
});

const deleteQuestionBankV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  await prisma.$executeRawUnsafe("DELETE FROM exam_question_bank WHERE tenant_id = ? AND id = ?", req.auth.tenantId, id);
  return res.apiSuccess("Question deleted", { id });
});

const archiveQuestionBankV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  await prisma.$executeRawUnsafe("UPDATE exam_question_bank SET is_archived = 1 WHERE tenant_id = ? AND id = ?", req.auth.tenantId, id);
  return res.apiSuccess("Question archived", { id });
});

const bulkUploadQuestionBank = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!items.length) {
    return res.apiError(400, "items[] is required", "VALIDATION_ERROR");
  }

  let createdCount = 0;

  for (const item of items) {
    const questionType = normalizeQuestionType(item.questionType);
    const questionText = String(item.questionText || "").trim();
    if (!questionType || !questionText) {
      continue;
    }

    const id = cuidLike("q");
    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_question_bank
       (id, tenant_id, owner_role, owner_user_id, subject_id, level_id, topic, question_type, question_text, answer_text, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.auth.tenantId,
      req.auth.role,
      req.auth.userId,
      item.subjectId ? String(item.subjectId) : null,
      item.levelId ? String(item.levelId) : null,
      item.topic ? String(item.topic) : null,
      questionType,
      questionText,
      item.answerText ? String(item.answerText) : null,
      JSON.stringify(parseJson(item.metadata, {}))
    );

    const options = Array.isArray(item.options) ? item.options : [];
    for (const [idx, option] of options.entries()) {
      const optionText = String(option?.optionText || "").trim();
      if (!optionText) {
        continue;
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO exam_question_option (id, tenant_id, question_id, option_label, option_text, is_correct, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        cuidLike("opt"),
        req.auth.tenantId,
        id,
        option?.optionLabel ? String(option.optionLabel) : null,
        optionText,
        option?.isCorrect ? 1 : 0,
        idx + 1
      );
    }

    createdCount += 1;
  }

  return res.apiSuccess("Bulk upload completed", { createdCount }, 201);
});

const importQuestionBankCsvV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const csvText = String(req.body.csvText || "");
  if (!csvText.trim()) {
    return res.apiError(400, "csvText is required", "VALIDATION_ERROR");
  }

  const lines = csvText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return res.apiError(400, "CSV must include header and rows", "VALIDATION_ERROR");
  }

  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const findIndex = (key) => header.indexOf(key);

  const idxType = findIndex("questiontype");
  const idxText = findIndex("questiontext");
  const idxAnswer = findIndex("answertext");
  const idxSubject = findIndex("subjectid");
  const idxLevel = findIndex("levelid");
  const idxTopic = findIndex("topic");

  let createdCount = 0;
  for (const line of lines.slice(1)) {
    const parts = line.split(",");
    const questionType = normalizeQuestionType(parts[idxType]);
    const questionText = String(parts[idxText] || "").trim();
    if (!questionType || !questionText) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_question_bank
      (id, tenant_id, owner_role, owner_user_id, question_type, question_text, answer_text, subject_id, level_id, topic, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cuidLike("q"),
      req.auth.tenantId,
      req.auth.role,
      req.auth.userId,
      questionType,
      questionText,
      idxAnswer >= 0 ? String(parts[idxAnswer] || "") : null,
      idxSubject >= 0 ? String(parts[idxSubject] || "") || null : null,
      idxLevel >= 0 ? String(parts[idxLevel] || "") || null : null,
      idxTopic >= 0 ? String(parts[idxTopic] || "") || null : null,
      JSON.stringify({ importedVia: "csv" })
    );

    createdCount += 1;
  }

  return res.apiSuccess("CSV imported", { createdCount }, 201);
});

const exportQuestionBankCsvV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, question_type AS questionType, question_text AS questionText, answer_text AS answerText,
            subject_id AS subjectId, level_id AS levelId, topic
     FROM exam_question_bank
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT 10000`,
    req.auth.tenantId
  );

  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    const doubled = text.replaceAll('"', '""');
    if (/[,\n\r"]/.test(doubled)) {
      return `"${doubled}"`;
    }
    return doubled;
  };

  const header = ["id", "questionType", "questionText", "answerText", "subjectId", "levelId", "topic"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(header.map((key) => escape(row[key])).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=exam-question-bank.csv");
  return res.status(200).send(`${lines.join("\n")}\n`);
});

const listExams = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, name, code, description, subject_id AS subjectId, level_id AS levelId,
            duration_minutes AS durationMinutes, total_marks AS totalMarks,
            passing_marks AS passingMarks, selection_mode AS selectionMode,
            status, created_at AS createdAt
     FROM exam_builder
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    req.auth.tenantId
  );

  if (rows.length) {
    return res.apiSuccess("Exams fetched", { items: rows });
  }

  const legacyRows = await prisma.$queryRawUnsafe(
    `SELECT id, name, code,
            examDurationMinutes AS durationMinutes,
            resultStatus AS status,
            createdAt AS createdAt
     FROM examcycle
     WHERE tenantId = ?
     ORDER BY createdAt DESC`,
    req.auth.tenantId
  );

  const items = legacyRows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    description: "Imported from Exam Cycle workflow",
    subjectId: null,
    levelId: null,
    durationMinutes: row.durationMinutes,
    totalMarks: null,
    passingMarks: null,
    selectionMode: "MIXED",
    status: row.status,
    createdAt: row.createdAt,
    isLegacy: true
  }));

  return res.apiSuccess("Exams fetched", { items });
});

const createExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || `EX-${Date.now()}`).trim();

  if (!name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  const id = cuidLike("exam");
  const durationMinutes = toInt(req.body.durationMinutes, 60);
  const totalMarks = toDecimal(req.body.totalMarks, 100);
  const passingMarks = toDecimal(req.body.passingMarks, 35);
  const selectionMode = String(req.body.selectionMode || "MIXED").toUpperCase();

  await prisma.$executeRawUnsafe(
    `INSERT INTO exam_builder
      (id, tenant_id, name, code, description, subject_id, level_id, duration_minutes, total_marks, passing_marks, selection_mode, status, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
    id,
    req.auth.tenantId,
    name,
    code,
    req.body.description ? String(req.body.description) : null,
    req.body.subjectId ? String(req.body.subjectId) : null,
    req.body.levelId ? String(req.body.levelId) : null,
    durationMinutes,
    totalMarks,
    passingMarks,
    selectionMode,
    req.auth.userId
  );

  const sections = Array.isArray(req.body.sections) ? req.body.sections : [];
  const fallbackSections = sections.length
    ? sections
    : [
        { sectionName: "Section A", questionCount: 10, sectionMarks: 30, selectionMode },
        { sectionName: "Section B", questionCount: 10, sectionMarks: 30, selectionMode },
        { sectionName: "Section C", questionCount: 10, sectionMarks: 40, selectionMode }
      ];

  for (const section of fallbackSections) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_builder_section
       (id, tenant_id, exam_id, section_name, question_count, section_marks, selection_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      cuidLike("sec"),
      req.auth.tenantId,
      id,
      String(section.sectionName || "Section").trim(),
      toInt(section.questionCount, 10),
      toDecimal(section.sectionMarks, 0),
      String(section.selectionMode || selectionMode).toUpperCase()
    );
  }

  return res.apiSuccess("Exam created", { id }, 201);
});

const updateExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);

  await prisma.$executeRawUnsafe(
    `UPDATE exam_builder
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         subject_id = COALESCE(?, subject_id),
         level_id = COALESCE(?, level_id),
         duration_minutes = COALESCE(?, duration_minutes),
         total_marks = COALESCE(?, total_marks),
         passing_marks = COALESCE(?, passing_marks),
         selection_mode = COALESCE(?, selection_mode)
     WHERE tenant_id = ? AND id = ?`,
    req.body.name === undefined ? null : String(req.body.name || "").trim(),
    req.body.description === undefined ? null : String(req.body.description || "").trim(),
    req.body.subjectId === undefined ? null : String(req.body.subjectId || "").trim(),
    req.body.levelId === undefined ? null : String(req.body.levelId || "").trim(),
    req.body.durationMinutes === undefined ? null : toInt(req.body.durationMinutes, 60),
    req.body.totalMarks === undefined ? null : toDecimal(req.body.totalMarks, 100),
    req.body.passingMarks === undefined ? null : toDecimal(req.body.passingMarks, 35),
    req.body.selectionMode === undefined ? null : String(req.body.selectionMode).toUpperCase(),
    req.auth.tenantId,
    id
  );

  if (Array.isArray(req.body.sections)) {
    await prisma.$executeRawUnsafe("DELETE FROM exam_builder_section WHERE tenant_id = ? AND exam_id = ?", req.auth.tenantId, id);
    for (const section of req.body.sections) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO exam_builder_section
         (id, tenant_id, exam_id, section_name, question_count, section_marks, selection_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        cuidLike("sec"),
        req.auth.tenantId,
        id,
        String(section.sectionName || "Section").trim(),
        toInt(section.questionCount, 10),
        toDecimal(section.sectionMarks, 0),
        String(section.selectionMode || "MIXED").toUpperCase()
      );
    }
  }

  return res.apiSuccess("Exam updated", { id });
});

const publishExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  await prisma.$executeRawUnsafe("UPDATE exam_builder SET status = 'PUBLISHED' WHERE tenant_id = ? AND id = ?", req.auth.tenantId, id);
  return res.apiSuccess("Exam published", { id });
});

const archiveExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  await prisma.$executeRawUnsafe("UPDATE exam_builder SET status = 'ARCHIVED' WHERE tenant_id = ? AND id = ?", req.auth.tenantId, id);
  return res.apiSuccess("Exam archived", { id });
});

const cloneExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);
  const rows = await prisma.$queryRawUnsafe("SELECT * FROM exam_builder WHERE tenant_id = ? AND id = ? LIMIT 1", req.auth.tenantId, id);
  const source = rows[0];

  if (!source) {
    return res.apiError(404, "Exam not found", "NOT_FOUND");
  }

  const clonedId = cuidLike("exam");
  const clonedCode = `${source.code}-CLONE-${Date.now().toString().slice(-4)}`;

  await prisma.$executeRawUnsafe(
    `INSERT INTO exam_builder
      (id, tenant_id, name, code, description, subject_id, level_id, duration_minutes, total_marks, passing_marks, selection_mode, status, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
    clonedId,
    req.auth.tenantId,
    `${source.name} (Clone)`,
    clonedCode,
    source.description,
    source.subject_id,
    source.level_id,
    source.duration_minutes,
    source.total_marks,
    source.passing_marks,
    source.selection_mode,
    req.auth.userId
  );

  const sections = await prisma.$queryRawUnsafe(
    "SELECT section_name, question_count, section_marks, selection_mode FROM exam_builder_section WHERE tenant_id = ? AND exam_id = ?",
    req.auth.tenantId,
    id
  );

  for (const section of sections) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_builder_section
       (id, tenant_id, exam_id, section_name, question_count, section_marks, selection_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      cuidLike("sec"),
      req.auth.tenantId,
      clonedId,
      section.section_name,
      section.question_count,
      section.section_marks,
      section.selection_mode
    );
  }

  return res.apiSuccess("Exam cloned", { id: clonedId }, 201);
});

const previewExam = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.params.id);

  const [examRows, sectionRows] = await Promise.all([
    prisma.$queryRawUnsafe("SELECT * FROM exam_builder WHERE tenant_id = ? AND id = ? LIMIT 1", req.auth.tenantId, examId),
    prisma.$queryRawUnsafe(
      "SELECT id, section_name AS sectionName, question_count AS questionCount, section_marks AS sectionMarks, selection_mode AS selectionMode FROM exam_builder_section WHERE tenant_id = ? AND exam_id = ? ORDER BY created_at ASC",
      req.auth.tenantId,
      examId
    )
  ]);

  if (!examRows.length) {
    return res.apiError(404, "Exam not found", "NOT_FOUND");
  }

  return res.apiSuccess("Exam preview", {
    exam: examRows[0],
    sections: sectionRows
  });
});

const generateExamPaper = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.params.id);

  const sectionRows = await prisma.$queryRawUnsafe(
    "SELECT id, section_name AS sectionName, question_count AS questionCount, selection_mode AS selectionMode FROM exam_builder_section WHERE tenant_id = ? AND exam_id = ? ORDER BY created_at ASC",
    req.auth.tenantId,
    examId
  );

  const examRows = await prisma.$queryRawUnsafe("SELECT level_id AS levelId, subject_id AS subjectId FROM exam_builder WHERE tenant_id = ? AND id = ? LIMIT 1", req.auth.tenantId, examId);
  if (!examRows.length) {
    return res.apiError(404, "Exam not found", "NOT_FOUND");
  }

  const exam = examRows[0];
  const paper = [];

  for (const section of sectionRows) {
    const questions = await prisma.$queryRawUnsafe(
      `SELECT id, question_type AS questionType, question_text AS questionText, answer_text AS answerText
       FROM exam_question_bank
       WHERE tenant_id = ?
         AND is_archived = 0
         AND (? IS NULL OR level_id = ?)
         AND (? IS NULL OR subject_id = ?)
       ORDER BY RAND()
       LIMIT ${Math.max(1, toInt(section.questionCount, 1))}`,
      req.auth.tenantId,
      exam.levelId,
      exam.levelId,
      exam.subjectId,
      exam.subjectId
    );

    paper.push({
      section: section.sectionName,
      selectionMode: section.selectionMode,
      questions
    });
  }

  return res.apiSuccess("Exam paper generated", { examId, paper });
});

const startAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.params.id);
  const studentId = String(req.body.studentId || req.auth.userId);

  const attemptId = cuidLike("att");
  await prisma.$executeRawUnsafe(
    `INSERT INTO exam_attempt (id, tenant_id, exam_id, student_id, status, autosave_json)
     VALUES (?, ?, ?, ?, 'IN_PROGRESS', ?)`,
    attemptId,
    req.auth.tenantId,
    examId,
    studentId,
    JSON.stringify({ answers: [] })
  );

  return res.apiSuccess("Attempt started", { attemptId }, 201);
});

const autosaveAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  const elapsedSeconds = toInt(req.body.elapsedSeconds, 0);
  const payload = JSON.stringify(parseJson(req.body.payload, {}));

  await prisma.$executeRawUnsafe(
    `UPDATE exam_attempt
     SET autosave_json = ?, elapsed_seconds = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    payload,
    elapsedSeconds,
    req.auth.tenantId,
    attemptId
  );

  return res.apiSuccess("Attempt autosaved", { attemptId });
});

const resumeAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  const rows = await prisma.$queryRawUnsafe(
    "SELECT id, exam_id AS examId, student_id AS studentId, status, elapsed_seconds AS elapsedSeconds, autosave_json AS autosave FROM exam_attempt WHERE tenant_id = ? AND id = ? LIMIT 1",
    req.auth.tenantId,
    attemptId
  );

  if (!rows.length) {
    return res.apiError(404, "Attempt not found", "NOT_FOUND");
  }

  const attempt = rows[0];
  attempt.autosave = parseJson(attempt.autosave, {});
  return res.apiSuccess("Attempt resumed", { attempt });
});

const submitAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  const elapsedSeconds = toInt(req.body.elapsedSeconds, 0);
  const lateSubmission = Boolean(req.body.lateSubmission);

  await prisma.$executeRawUnsafe(
    `UPDATE exam_attempt
     SET status = ?, submitted_at = CURRENT_TIMESTAMP, elapsed_seconds = ?, autosave_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE tenant_id = ? AND id = ?`,
    lateSubmission ? "SUBMITTED_LATE" : "SUBMITTED",
    elapsedSeconds,
    JSON.stringify(parseJson(req.body.payload, {})),
    req.auth.tenantId,
    attemptId
  );

  return res.apiSuccess("Attempt submitted", { attemptId, lateSubmission });
});

const evaluateAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  const marks = toDecimal(req.body.marks, 0);
  const remarks = req.body.remarks ? String(req.body.remarks) : null;

  await prisma.$executeRawUnsafe(
    "UPDATE exam_attempt SET marks_obtained = ?, remarks = ?, moderation_status = 'REVIEWED' WHERE tenant_id = ? AND id = ?",
    marks,
    remarks,
    req.auth.tenantId,
    attemptId
  );

  return res.apiSuccess("Marks entered", { attemptId, marks });
});

const bulkEvaluateAttempts = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const evaluations = Array.isArray(req.body.evaluations) ? req.body.evaluations : [];

  let updated = 0;
  for (const row of evaluations) {
    if (!row?.attemptId) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      "UPDATE exam_attempt SET marks_obtained = ?, remarks = ?, moderation_status = 'REVIEWED' WHERE tenant_id = ? AND id = ?",
      toDecimal(row.marks, 0),
      row.remarks ? String(row.remarks) : null,
      req.auth.tenantId,
      String(row.attemptId)
    );
    updated += 1;
  }

  return res.apiSuccess("Bulk marks entry completed", { updated });
});

const moderateAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  await prisma.$executeRawUnsafe("UPDATE exam_attempt SET moderation_status = 'MODERATED' WHERE tenant_id = ? AND id = ?", req.auth.tenantId, attemptId);
  return res.apiSuccess("Attempt moderated", { attemptId });
});

const approveAttempt = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const attemptId = String(req.params.id);
  await prisma.$executeRawUnsafe("UPDATE exam_attempt SET approval_status = 'APPROVED' WHERE tenant_id = ? AND id = ?", req.auth.tenantId, attemptId);
  return res.apiSuccess("Attempt approved", { attemptId });
});

const generateResults = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.body.examId || "").trim();
  if (!examId) {
    return res.apiError(400, "examId is required", "VALIDATION_ERROR");
  }

  const examRows = await prisma.$queryRawUnsafe("SELECT total_marks AS totalMarks, passing_marks AS passingMarks FROM exam_builder WHERE tenant_id = ? AND id = ? LIMIT 1", req.auth.tenantId, examId);
  if (!examRows.length) {
    return res.apiError(404, "Exam not found", "NOT_FOUND");
  }

  const exam = examRows[0];
  const attempts = await prisma.$queryRawUnsafe(
    `SELECT id, student_id AS studentId, COALESCE(marks_obtained, 0) AS marks
     FROM exam_attempt
     WHERE tenant_id = ? AND exam_id = ? AND status IN ('SUBMITTED', 'SUBMITTED_LATE')
     ORDER BY COALESCE(marks_obtained, 0) DESC, updated_at ASC`,
    req.auth.tenantId,
    examId
  );

  await prisma.$executeRawUnsafe("DELETE FROM exam_result WHERE tenant_id = ? AND exam_id = ?", req.auth.tenantId, examId);

  let rank = 0;
  for (const attempt of attempts) {
    rank += 1;
    const marks = Number(attempt.marks || 0);
    const percent = exam.totalMarks > 0 ? (marks / Number(exam.totalMarks)) * 100 : 0;
    const passFail = marks >= Number(exam.passingMarks) ? "PASS" : "FAIL";

    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_result
       (id, tenant_id, exam_id, student_id, marks, percentile, grade, pass_fail, center_rank, franchise_rank, global_rank)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cuidLike("res"),
      req.auth.tenantId,
      examId,
      attempt.studentId,
      marks,
      Number(percent.toFixed(2)),
      gradeByPercent(percent),
      passFail,
      rank,
      rank,
      rank
    );
  }

  return res.apiSuccess("Results generated", { examId, generatedCount: attempts.length });
});

const listResults = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.params.examId);

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, student_id AS studentId, marks, percentile, grade, pass_fail AS passFail,
            center_rank AS centerRank, franchise_rank AS franchiseRank, global_rank AS globalRank,
            generated_at AS generatedAt
     FROM exam_result
     WHERE tenant_id = ? AND exam_id = ?
     ORDER BY global_rank ASC`,
    req.auth.tenantId,
    examId
  );

  return res.apiSuccess("Results fetched", { items: rows });
});

const generateCertificates = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.body.examId || "").trim();
  const certificateType = String(req.body.certificateType || "PARTICIPATION").toUpperCase();

  if (!examId) {
    return res.apiError(400, "examId is required", "VALIDATION_ERROR");
  }

  const results = await prisma.$queryRawUnsafe(
    "SELECT student_id AS studentId, global_rank AS globalRank FROM exam_result WHERE tenant_id = ? AND exam_id = ?",
    req.auth.tenantId,
    examId
  );

  let issuedCount = 0;
  for (const row of results) {
    const certNo = `CERT-${examId.slice(-6)}-${row.studentId.slice(-6)}-${Date.now().toString().slice(-4)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO exam_certificate
       (id, tenant_id, exam_id, student_id, certificate_type, certificate_no, pdf_url, status, issue_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ISSUED', 1)`,
      cuidLike("cert"),
      req.auth.tenantId,
      examId,
      row.studentId,
      certificateType,
      certNo,
      `/api/exam-platform/certificates/download/${certNo}`
    );

    issuedCount += 1;
  }

  return res.apiSuccess("Certificates generated", { examId, issuedCount });
});

const listCertificates = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const examId = String(req.params.examId);

  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, student_id AS studentId, certificate_type AS certificateType, certificate_no AS certificateNo,
            pdf_url AS pdfUrl, status, issue_version AS issueVersion, issued_at AS issuedAt
     FROM exam_certificate
     WHERE tenant_id = ? AND exam_id = ?
     ORDER BY issued_at DESC`,
    req.auth.tenantId,
    examId
  );

  return res.apiSuccess("Certificates fetched", { items: rows });
});

const reissueCertificate = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);

  await prisma.$executeRawUnsafe(
    `UPDATE exam_certificate
     SET issue_version = issue_version + 1,
         issued_at = CURRENT_TIMESTAMP,
         status = 'ISSUED'
     WHERE tenant_id = ? AND id = ?`,
    req.auth.tenantId,
    id
  );

  return res.apiSuccess("Certificate reissued", { id });
});

const downloadCertificate = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const certificateNo = String(req.params.certificateNo);

  const rows = await prisma.$queryRawUnsafe(
    "SELECT certificate_no AS certificateNo, certificate_type AS certificateType, exam_id AS examId, student_id AS studentId, issued_at AS issuedAt FROM exam_certificate WHERE tenant_id = ? AND certificate_no = ? LIMIT 1",
    req.auth.tenantId,
    certificateNo
  );

  if (!rows.length) {
    return res.apiError(404, "Certificate not found", "NOT_FOUND");
  }

  const cert = rows[0];
  const body = [
    "ABACUS EDUCATION CERTIFICATE",
    `Certificate No: ${cert.certificateNo}`,
    `Type: ${cert.certificateType}`,
    `Exam: ${cert.examId}`,
    `Student: ${cert.studentId}`,
    `Issued At: ${new Date(cert.issuedAt).toISOString()}`
  ].join("\n");

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${cert.certificateNo}.txt`);
  return res.status(200).send(`${body}\n`);
});

const listCompetitionsBuilder = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const rows = await prisma.$queryRawUnsafe(
    `SELECT id, name, code, description, subject_id AS subjectId, level_id AS levelId,
            stage, status, starts_at AS startsAt, ends_at AS endsAt, created_at AS createdAt
     FROM competition_builder
     WHERE tenant_id = ?
     ORDER BY created_at DESC`,
    req.auth.tenantId
  );

  if (rows.length) {
    return res.apiSuccess("Competitions fetched", { items: rows });
  }

  const legacyRows = await prisma.$queryRawUnsafe(
    `SELECT id, title, status, startsAt AS startsAt, endsAt AS endsAt, createdAt AS createdAt
     FROM competition
     WHERE tenantId = ?
     ORDER BY createdAt DESC`,
    req.auth.tenantId
  );

  const items = legacyRows.map((row) => ({
    id: row.id,
    name: row.title,
    code: `LEGACY-${String(row.id).slice(-6).toUpperCase()}`,
    description: "Imported from Competition workflow",
    subjectId: null,
    levelId: null,
    stage: "FINAL",
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    isLegacy: true
  }));

  return res.apiSuccess("Competitions fetched", { items });
});

const createCompetitionBuilder = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const name = String(req.body.name || "").trim();
  const code = String(req.body.code || `COMP-${Date.now()}`).trim();
  if (!name) {
    return res.apiError(400, "name is required", "VALIDATION_ERROR");
  }

  const id = cuidLike("comp");
  await prisma.$executeRawUnsafe(
    `INSERT INTO competition_builder
     (id, tenant_id, name, code, description, subject_id, level_id, stage, status, starts_at, ends_at, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'REGISTRATION', 'DRAFT', ?, ?, ?)`,
    id,
    req.auth.tenantId,
    name,
    code,
    req.body.description ? String(req.body.description) : null,
    req.body.subjectId ? String(req.body.subjectId) : null,
    req.body.levelId ? String(req.body.levelId) : null,
    req.body.startsAt ? new Date(req.body.startsAt) : null,
    req.body.endsAt ? new Date(req.body.endsAt) : null,
    req.auth.userId
  );

  return res.apiSuccess("Competition created", { id }, 201);
});

const updateCompetitionBuilder = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const id = String(req.params.id);

  await prisma.$executeRawUnsafe(
    `UPDATE competition_builder
     SET name = COALESCE(?, name),
         description = COALESCE(?, description),
         subject_id = COALESCE(?, subject_id),
         level_id = COALESCE(?, level_id),
         stage = COALESCE(?, stage),
         status = COALESCE(?, status),
         starts_at = COALESCE(?, starts_at),
         ends_at = COALESCE(?, ends_at)
     WHERE tenant_id = ? AND id = ?`,
    req.body.name === undefined ? null : String(req.body.name || "").trim(),
    req.body.description === undefined ? null : String(req.body.description || "").trim(),
    req.body.subjectId === undefined ? null : String(req.body.subjectId || "").trim(),
    req.body.levelId === undefined ? null : String(req.body.levelId || "").trim(),
    req.body.stage === undefined ? null : String(req.body.stage || "").toUpperCase(),
    req.body.status === undefined ? null : String(req.body.status || "").toUpperCase(),
    req.body.startsAt === undefined ? null : new Date(req.body.startsAt),
    req.body.endsAt === undefined ? null : new Date(req.body.endsAt),
    req.auth.tenantId,
    id
  );

  return res.apiSuccess("Competition updated", { id });
});

const registerCompetitionParticipant = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const competitionId = String(req.params.id);
  const studentId = String(req.body.studentId || req.auth.userId);

  await prisma.$executeRawUnsafe(
    `INSERT INTO competition_participant
     (id, tenant_id, competition_id, student_id, stage, total_score)
     VALUES (?, ?, ?, ?, 'REGISTRATION', 0)
     ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
    cuidLike("cp"),
    req.auth.tenantId,
    competitionId,
    studentId
  );

  return res.apiSuccess("Participant registered", { competitionId, studentId }, 201);
});

const advanceCompetitionStage = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const competitionId = String(req.params.id);
  const stage = String(req.body.stage || "QUALIFICATION").toUpperCase();

  await prisma.$executeRawUnsafe(
    "UPDATE competition_builder SET stage = ?, status = 'ACTIVE' WHERE tenant_id = ? AND id = ?",
    stage,
    req.auth.tenantId,
    competitionId
  );

  await prisma.$executeRawUnsafe(
    "UPDATE competition_participant SET stage = ? WHERE tenant_id = ? AND competition_id = ?",
    stage,
    req.auth.tenantId,
    competitionId
  );

  return res.apiSuccess("Competition stage advanced", { competitionId, stage });
});

const judgeCompetition = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const competitionId = String(req.params.id);
  const scores = Array.isArray(req.body.scores) ? req.body.scores : [];

  let updated = 0;
  for (const score of scores) {
    if (!score?.studentId) {
      continue;
    }

    await prisma.$executeRawUnsafe(
      "UPDATE competition_participant SET total_score = ? WHERE tenant_id = ? AND competition_id = ? AND student_id = ?",
      toDecimal(score.totalScore, 0),
      req.auth.tenantId,
      competitionId,
      String(score.studentId)
    );
    updated += 1;
  }

  return res.apiSuccess("Judging saved", { updated });
});

const publishCompetitionWinners = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const competitionId = String(req.params.id);

  const participants = await prisma.$queryRawUnsafe(
    `SELECT id, student_id AS studentId, total_score AS totalScore
     FROM competition_participant
     WHERE tenant_id = ? AND competition_id = ?
     ORDER BY total_score DESC, created_at ASC`,
    req.auth.tenantId,
    competitionId
  );

  let rank = 0;
  for (const row of participants) {
    rank += 1;
    const medal = rank === 1 ? "GOLD" : rank === 2 ? "SILVER" : rank === 3 ? "BRONZE" : null;
    await prisma.$executeRawUnsafe(
      `UPDATE competition_participant
       SET rank_position = ?, medal_type = ?, winner_title = ?
       WHERE tenant_id = ? AND id = ?`,
      rank,
      medal,
      rank <= 3 ? `WINNER_${rank}` : null,
      req.auth.tenantId,
      row.id
    );
  }

  await prisma.$executeRawUnsafe(
    "UPDATE competition_builder SET status = 'COMPLETED', stage = 'FINAL' WHERE tenant_id = ? AND id = ?",
    req.auth.tenantId,
    competitionId
  );

  return res.apiSuccess("Winners published", { competitionId, winners: Math.min(3, participants.length) });
});

const getCompetitionLeaderboardV2 = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();
  const competitionId = String(req.params.id);

  const rows = await prisma.$queryRawUnsafe(
    `SELECT student_id AS studentId, stage, total_score AS totalScore,
            rank_position AS rankPosition, medal_type AS medalType, winner_title AS winnerTitle
     FROM competition_participant
     WHERE tenant_id = ? AND competition_id = ?
     ORDER BY COALESCE(rank_position, 999999), total_score DESC`,
    req.auth.tenantId,
    competitionId
  );

  return res.apiSuccess("Leaderboard fetched", { items: rows });
});

const getExamPlatformDashboard = asyncHandler(async (req, res) => {
  await ensureExamPlatformTables();

  const [
    platformUpcomingExams,
    legacyUpcomingExams,
    platformPendingEvaluations,
    legacyPendingEvaluations,
    platformCompetitionStats,
    legacyCompetitionStats,
    platformPassRate,
    legacyPassRate,
    reviewedSubmissions
  ] = await Promise.all([
    safeCount("SELECT COUNT(*) AS c FROM exam_builder WHERE tenant_id = ? AND status IN ('DRAFT', 'PUBLISHED')", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM examcycle WHERE tenantId = ?", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM exam_attempt WHERE tenant_id = ? AND status IN ('SUBMITTED', 'SUBMITTED_LATE') AND approval_status <> 'APPROVED'", req.auth.tenantId),
    safeCount("SELECT COUNT(*) AS c FROM worksheetsubmission WHERE tenantId = ? AND status = 'PENDING'", req.auth.tenantId),
    prisma.$queryRawUnsafe(
      "SELECT COUNT(*) AS totalCompetitions, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCompetitions FROM competition_builder WHERE tenant_id = ?",
      req.auth.tenantId
    ),
    prisma.$queryRawUnsafe(
      "SELECT COUNT(*) AS totalCompetitions, SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completedCompetitions FROM competition WHERE tenantId = ?",
      req.auth.tenantId
    ),
    prisma.$queryRawUnsafe(
      "SELECT SUM(CASE WHEN pass_fail = 'PASS' THEN 1 ELSE 0 END) AS passCount, COUNT(*) AS totalCount FROM exam_result WHERE tenant_id = ?",
      req.auth.tenantId
    ),
    prisma.$queryRawUnsafe(
      "SELECT SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passCount, COUNT(*) AS totalCount FROM worksheetsubmission WHERE tenantId = ? AND status = 'REVIEWED'",
      req.auth.tenantId
    ),
    safeCount("SELECT COUNT(*) AS c FROM worksheetsubmission WHERE tenantId = ? AND status = 'REVIEWED'", req.auth.tenantId)
  ]);

  const passCount = Number(platformPassRate?.[0]?.passCount || 0) + Number(legacyPassRate?.[0]?.passCount || 0);
  const totalCount = Number(platformPassRate?.[0]?.totalCount || 0) + Number(legacyPassRate?.[0]?.totalCount || 0);
  const passRate = totalCount ? Number(((passCount / totalCount) * 100).toFixed(2)) : 0;

  return res.apiSuccess("Dashboard fetched", {
    role: req.auth.role,
    upcomingExams: platformUpcomingExams + legacyUpcomingExams,
    pendingEvaluations: platformPendingEvaluations + legacyPendingEvaluations,
    competitionStatistics: {
      totalCompetitions:
        Number(platformCompetitionStats?.[0]?.totalCompetitions || 0) +
        Number(legacyCompetitionStats?.[0]?.totalCompetitions || 0),
      completedCompetitions:
        Number(platformCompetitionStats?.[0]?.completedCompetitions || 0) +
        Number(legacyCompetitionStats?.[0]?.completedCompetitions || 0)
    },
    passRate,
    rankDistribution: {
      buckets: ["1-10", "11-50", "51+"],
      values: [0, 0, reviewedSubmissions]
    }
  });
});

export {
  listExamPlatformAudit,
  listSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  listQuestionBankV2,
  createQuestionBankV2,
  updateQuestionBankV2,
  deleteQuestionBankV2,
  archiveQuestionBankV2,
  importQuestionBankCsvV2,
  exportQuestionBankCsvV2,
  bulkUploadQuestionBank,
  listExams,
  createExam,
  updateExam,
  publishExam,
  archiveExam,
  cloneExam,
  previewExam,
  generateExamPaper,
  startAttempt,
  autosaveAttempt,
  resumeAttempt,
  submitAttempt,
  evaluateAttempt,
  bulkEvaluateAttempts,
  moderateAttempt,
  approveAttempt,
  generateResults,
  listResults,
  generateCertificates,
  listCertificates,
  reissueCertificate,
  downloadCertificate,
  listCompetitionsBuilder,
  createCompetitionBuilder,
  updateCompetitionBuilder,
  registerCompetitionParticipant,
  advanceCompetitionStage,
  judgeCompetition,
  publishCompetitionWinners,
  getCompetitionLeaderboardV2,
  getExamPlatformDashboard
};
