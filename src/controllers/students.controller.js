import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { recordAudit } from "../utils/audit.js";
import { hashPassword } from "../utils/password.js";
import ExcelJS from "exceljs";
import crypto from "crypto";
import { parse as parseCsv } from "csv-parse/sync";
import { getLevelPerformance } from "../services/student-performance.service.js";
import { createBulkNotification } from "../services/notification.service.js";
import { recordStudentPaymentTransaction } from "../services/financial-ledger.service.js";
import { assertCanModifyOperational } from "../services/ownership-guard.service.js";
import {
  assignLevelWithIntegrity,
  evaluatePassThreshold,
  validateInitialStudentLevel
} from "../services/student-lifecycle.service.js";
import { parsePagination } from "../utils/pagination.js";
import { buildUploadUrl } from "../utils/request-url.js";
import { recordEnrollmentTransaction } from "../services/financial-ledger.service.js";
import { toCsv } from "../utils/csv.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";

function parseIsoDateOnly(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const err = new Error("Invalid date format. Use YYYY-MM-DD");
    err.statusCode = 400;
    err.errorCode = "VALIDATION_ERROR";
    throw err;
  }
  return new Date(`${text}T00:00:00.000Z`);
}

function normalizeNoteTags(tags) {
  if (tags === undefined) return undefined;
  if (tags === null) return null;
  if (Array.isArray(tags)) return tags;
  if (tags && typeof tags === "object") return tags;
  return null;
}

function normalizeActiveStatus(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const normalized = String(value).trim().toUpperCase();
  if (normalized === "ACTIVE") return true;
  if (normalized === "INACTIVE") return false;
  return null;
}

function isUniqueConstraintError(error) {
  const code = error?.code ? String(error.code) : "";
  return code === "P2002";
}

function makeApiError(statusCode, message, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function getUniqueConstraintTargets(error) {
  const target = error?.meta?.target;
  if (!target) return [];
  if (Array.isArray(target)) return target.map((t) => String(t));
  return [String(target)];
}

function uniqueTargetsInclude(error, needle) {
  const targets = getUniqueConstraintTargets(error)
    .join("|")
    .toLowerCase();
  return targets.includes(String(needle).toLowerCase());
}

function makeStudentPlaceholderEmail({ tenantId, studentId }) {
  const safeTenant = String(tenantId || "tenant").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "tenant";
  const safeStudent = String(studentId || "student").replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) || "student";
  return `no-email+${safeTenant}.${safeStudent}@abacus.invalid`;
}

function isAdmissionNoUniqueCollision(error) {
  if (!isUniqueConstraintError(error)) return false;
  return uniqueTargetsInclude(error, "admissionNo") || uniqueTargetsInclude(error, "admissionno");
}

function isStudentEmailUniqueCollision(error) {
  if (!isUniqueConstraintError(error)) return false;
  // Student has @@unique([tenantId, email])
  return uniqueTargetsInclude(error, "email");
}

function normalizeAdmissionNo(value) {
  const trimmed = String(value || "").trim();
  return trimmed.length ? trimmed : null;
}

function isSchemaDriftError(error) {
  return isSchemaMismatchError(error);
}

function normalizeMoney(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { error: "Amount must be a non-negative number" };
  }
  return Number(num.toFixed(2));
}

function normalizeConcessionAmount(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return 0;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    return { error: "Concession must be a non-negative number" };
  }
  return Number(num.toFixed(2));
}

async function getLevelFeeDefaults({ tx, tenantId, levelId }) {
  try {
    return await tx.level.findFirst({
      where: {
        id: String(levelId),
        tenantId
      },
      select: {
        id: true,
        name: true,
        rank: true,
        defaultTotalFeeAmount: true,
        defaultAdmissionFeeAmount: true
      }
    });
  } catch (error) {
    if (!isSchemaMismatchError(error, ["defaulttotalfeeamount", "defaultadmissionfeeamount"])) {
      throw error;
    }

    return tx.level.findFirst({
      where: {
        id: String(levelId),
        tenantId
      },
      select: {
        id: true,
        name: true,
        rank: true
      }
    });
  }
}

function buildStudentCreateData({
  tenantId,
  admissionNo,
  firstName,
  lastName,
  normalizedGender,
  email,
  dateOfBirth,
  hierarchyNodeId,
  resolvedLevelId,
  guardianName,
  guardianPhone,
  guardianEmail,
  phonePrimary,
  phoneSecondary,
  address,
  state,
  district,
  tehsil,
  normalizedTotalFeeAmount,
  normalizedAdmissionFeeAmount,
  levelDefaults,
  resolvedCurrentTeacherUserId,
  isActive,
  compatibilityMode = false
}) {
  const data = {
    tenantId,
    admissionNo,
    firstName,
    lastName,
    hierarchyNodeId,
    levelId: resolvedLevelId,
    ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
  };

  if (compatibilityMode) {
    return data;
  }

  return {
    ...data,
    gender: normalizedGender || null,
    email,
    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    guardianName: guardianName ? String(guardianName) : null,
    guardianPhone: guardianPhone ? String(guardianPhone) : null,
    guardianEmail: guardianEmail ? String(guardianEmail) : null,
    phonePrimary: phonePrimary ? String(phonePrimary) : null,
    phoneSecondary: phoneSecondary ? String(phoneSecondary) : null,
    address: address ? String(address) : null,
    state: state ? String(state) : null,
    district: district ? String(district) : null,
    tehsil: tehsil ? String(tehsil) : null,
    totalFeeAmount: normalizedTotalFeeAmount !== undefined
      ? normalizedTotalFeeAmount
      : (levelDefaults?.defaultTotalFeeAmount == null ? null : Number(levelDefaults.defaultTotalFeeAmount)),
    admissionFeeAmount: normalizedAdmissionFeeAmount !== undefined
      ? normalizedAdmissionFeeAmount
      : (levelDefaults?.defaultAdmissionFeeAmount == null ? null : Number(levelDefaults.defaultAdmissionFeeAmount)),
    feeConcessionAmount: 0,
    currentTeacherUserId: resolvedCurrentTeacherUserId
  };
}

function buildStudentFeeAmounts(levelDefaults, feeConcessionAmount) {
  if (!levelDefaults) {
    throw makeApiError(404, "Level not found", "LEVEL_NOT_FOUND");
  }

  const defaultTotal = levelDefaults.defaultTotalFeeAmount == null ? null : Number(levelDefaults.defaultTotalFeeAmount);
  const defaultAdmission = levelDefaults.defaultAdmissionFeeAmount == null ? null : Number(levelDefaults.defaultAdmissionFeeAmount);
  const concession = Number(feeConcessionAmount || 0);

  if (defaultTotal !== null && concession > defaultTotal) {
    throw makeApiError(400, "Concession cannot exceed the level default fee", "VALIDATION_ERROR");
  }

  return {
    totalFeeAmount: defaultTotal === null ? null : Number(Math.max(0, defaultTotal - concession).toFixed(2)),
    admissionFeeAmount: defaultAdmission,
    feeConcessionAmount: Number(concession.toFixed(2))
  };
}

async function syncStudentFeeDefaults({ tx, tenantId, studentId, levelId, feeConcessionAmount }) {
  const levelDefaults = await getLevelFeeDefaults({ tx, tenantId, levelId });
  const feeAmounts = buildStudentFeeAmounts(levelDefaults, feeConcessionAmount);

  return tx.student.update({
    where: { id: studentId },
    data: feeAmounts
  });
}

function parseStudentCodeNumeric(code, prefix) {
  const text = String(code || "").trim();
  const re = new RegExp(`^${prefix}(\\d+)$`);
  const match = text.match(re);
  if (!match) return null;
  const num = Number(match[1]);
  if (!Number.isInteger(num) || num < 0) return null;
  return { num, width: Math.max(4, match[1].length) };
}

function formatStudentCode(prefix, num, width) {
  return `${prefix}${String(num).padStart(width, "0")}`;
}

function generateTempPassword() {
  return crypto.randomBytes(12).toString("base64url");
}

function toPlainNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Number(toPlainNumber(value).toFixed(2));
}

function normalizeCsvHeaderKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getCsvField(row, keys = []) {
  for (const key of keys) {
    const normalized = normalizeCsvHeaderKey(key);
    const value = row[normalized];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

const importCsvExpectedHeaders = new Set([
  "admissionno",
  "firstname",
  "lastname",
  "gender",
  "dateofbirth",
  "guardianname",
  "guardianphone",
  "guardianemail",
  "email",
  "phoneprimary",
  "phonesecondary",
  "address",
  "state",
  "district",
  "tehsil",
  "levelname",
  "levelrank",
  "batchname",
  "teacheremail",
  "startdate",
  "totalfeeamount",
  "admissionfeeamount",
  "feeconcessionamount",
  "isactive"
]);

function scoreImportedCsvRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return -1;

  const firstRow = rows[0] || {};
  const normalizedKeys = Object.keys(firstRow)
    .map((key) => normalizeCsvHeaderKey(key))
    .filter(Boolean);

  if (!normalizedKeys.length) return -1;

  const uniqueKeys = new Set(normalizedKeys);
  let expectedMatches = 0;
  for (const key of uniqueKeys) {
    if (importCsvExpectedHeaders.has(key)) {
      expectedMatches += 1;
    }
  }

  return expectedMatches * 100 + uniqueKeys.size;
}

function parseImportCsvRows(fileBuffer) {
  const delimiters = [",", ";", "\t", "|"];
  const buffer = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : Buffer.from(String(fileBuffer || ""), "utf8");

  const utf8Text = buffer.toString("utf-8");
  const parseTexts = [utf8Text];

  const hasUtf16LeBom = buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE;
  const hasUtf16BeBom = buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF;
  if (hasUtf16LeBom || hasUtf16BeBom || utf8Text.includes("\u0000")) {
    parseTexts.push(buffer.toString("utf16le"));
  }

  let bestRows = [];
  let bestScore = -1;

  for (const text of parseTexts) {
    if (!String(text || "").trim()) continue;

    for (const delimiter of delimiters) {
      let rows;
      try {
        rows = parseCsv(text, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          bom: true,
          delimiter,
          relax_column_count: true
        });
      } catch {
        continue;
      }

      const score = scoreImportedCsvRows(rows);
      if (score > bestScore) {
        bestScore = score;
        bestRows = rows;
      }
    }
  }

  return Array.isArray(bestRows) ? bestRows : [];
}

function parseOptionalCsvDate(value, label) {
  const text = String(value || "").trim();
  if (!text) return null;
  try {
    return parseIsoDateOnly(text);
  } catch {
    throw makeApiError(400, `${label} must use YYYY-MM-DD`, "VALIDATION_ERROR");
  }
}

function normalizeImportMoney(value, label) {
  const text = String(value || "").trim();
  if (!text) return undefined;
  const normalized = normalizeMoney(text);
  if (normalized?.error) {
    throw makeApiError(400, `${label}: ${normalized.error}`, "VALIDATION_ERROR");
  }
  return normalized;
}

function normalizeImportConcession(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  const normalized = normalizeConcessionAmount(text);
  if (normalized?.error) {
    throw makeApiError(400, normalized.error, "VALIDATION_ERROR");
  }
  return normalized;
}

function normalizeBooleanFlag(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "active"].includes(text)) return true;
  if (["false", "0", "no", "n", "inactive"].includes(text)) return false;
  return defaultValue;
}

function getStudentExportWhere(req) {
  const where = {
    tenantId: req.auth.tenantId
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const q = req.query.q ? String(req.query.q).trim() : "";
  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } }
    ];
  }

  const active = normalizeActiveStatus(req.query.status);
  if (active !== null) {
    where.isActive = active;
  }

  if (req.query.levelId) {
    where.levelId = String(req.query.levelId);
  }

  const teacherUserId = req.query.teacherUserId ? String(req.query.teacherUserId) : "";
  if (teacherUserId) {
    where.batchEnrollments = {
      some: {
        status: "ACTIVE",
        assignedTeacherUserId: teacherUserId
      }
    };
  }

  const courseCode = req.query.courseCode ? String(req.query.courseCode).trim() : "";
  if (courseCode) {
    where.level = {
      is: {
        name: { contains: courseCode }
      }
    };
  }

  return where;
}

const STUDENT_EXPORT_COLUMNS = [
  { key: "admissionNo", header: "Admission No" },
  { key: "fullName", header: "Full Name" },
  { key: "gender", header: "Gender" },
  { key: "dateOfBirth", header: "Date Of Birth" },
  { key: "email", header: "Student Email" },
  { key: "guardianName", header: "Guardian Name" },
  { key: "guardianPhone", header: "Guardian Phone" },
  { key: "guardianEmail", header: "Guardian Email" },
  { key: "phonePrimary", header: "Phone Primary" },
  { key: "phoneSecondary", header: "Phone Secondary" },
  { key: "address", header: "Address" },
  { key: "state", header: "State" },
  { key: "district", header: "District" },
  { key: "tehsil", header: "Tehsil" },
  { key: "centerName", header: "Center Name" },
  { key: "centerType", header: "Center Type" },
  { key: "levelName", header: "Level" },
  { key: "levelRank", header: "Level Rank" },
  { key: "courseNames", header: "Courses" },
  { key: "activeBatchName", header: "Active Batch" },
  { key: "enrollmentStatus", header: "Enrollment Status" },
  { key: "enrollmentStartDate", header: "Enrollment Start Date" },
  { key: "assignedTeacher", header: "Assigned Teacher" },
  { key: "totalFeeAmount", header: "Total Fee" },
  { key: "admissionFeeAmount", header: "Admission Fee" },
  { key: "feeConcessionAmount", header: "Fee Concession" },
  { key: "totalPaidAmount", header: "Total Paid" },
  { key: "pendingFeeAmount", header: "Pending Fee" },
  { key: "feeStatus", header: "Fee Status" },
  { key: "paymentCount", header: "Payment Count" },
  { key: "lastPaymentDate", header: "Last Payment Date" },
  { key: "attendanceSessions", header: "Attendance Sessions" },
  { key: "attendancePresent", header: "Attendance Present" },
  { key: "attendanceAbsent", header: "Attendance Absent" },
  { key: "attendanceLate", header: "Attendance Late" },
  { key: "attendanceExcused", header: "Attendance Excused" },
  { key: "attendanceRate", header: "Attendance Rate %" },
  { key: "isActive", header: "Student Active" },
  { key: "createdAt", header: "Created At" },
  { key: "updatedAt", header: "Updated At" }
];

async function buildDetailedStudentExportRows(where) {
  const students = await prisma.student.findMany({
    where,
    orderBy: [{ admissionNo: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      gender: true,
      email: true,
      dateOfBirth: true,
      guardianName: true,
      guardianPhone: true,
      guardianEmail: true,
      phonePrimary: true,
      phoneSecondary: true,
      address: true,
      state: true,
      district: true,
      tehsil: true,
      totalFeeAmount: true,
      admissionFeeAmount: true,
      feeConcessionAmount: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      hierarchyNode: { select: { name: true, type: true } },
      level: { select: { name: true, rank: true } },
      course: { select: { name: true, code: true } },
      assignedCourses: {
        select: {
          course: {
            select: { name: true, code: true }
          }
        }
      },
      currentTeacher: {
        select: {
          username: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      },
      batchEnrollments: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          status: true,
          startDate: true,
          batch: { select: { name: true } },
          level: { select: { name: true, rank: true } },
          assignedTeacher: {
            select: {
              username: true,
              email: true,
              teacherProfile: { select: { fullName: true } }
            }
          }
        }
      }
    }
  });

  const studentIds = students.map((student) => student.id);
  if (!studentIds.length) {
    return [];
  }

  const [paymentAgg, attendanceAgg] = await Promise.all([
    prisma.financialTransaction.groupBy({
      by: ["studentId"],
      where: {
        tenantId: where.tenantId,
        studentId: { in: studentIds },
        type: { in: ["ENROLLMENT", "RENEWAL"] }
      },
      _sum: { grossAmount: true },
      _count: { _all: true },
      _max: { receivedAt: true, createdAt: true }
    }),
    prisma.attendanceEntry.groupBy({
      by: ["studentId", "status"],
      where: {
        tenantId: where.tenantId,
        studentId: { in: studentIds }
      },
      _count: { _all: true }
    })
  ]);

  const paymentByStudentId = new Map(
    paymentAgg.map((row) => [String(row.studentId), row])
  );

  const attendanceByStudentId = new Map();
  for (const row of attendanceAgg) {
    const key = String(row.studentId);
    if (!attendanceByStudentId.has(key)) {
      attendanceByStudentId.set(key, {
        totalSessions: 0,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        excusedCount: 0
      });
    }

    const summary = attendanceByStudentId.get(key);
    const count = toPlainNumber(row?._count?._all);
    summary.totalSessions += count;
    if (row.status === "PRESENT") summary.presentCount += count;
    if (row.status === "ABSENT") summary.absentCount += count;
    if (row.status === "LATE") summary.lateCount += count;
    if (row.status === "EXCUSED") summary.excusedCount += count;
  }

  return students.map((student) => {
    const payment = paymentByStudentId.get(student.id);
    const attendance = attendanceByStudentId.get(student.id) || {
      totalSessions: 0,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0
    };
    const activeEnrollment = student.batchEnrollments?.[0] || null;
    const effectiveLevel = activeEnrollment?.level || student.level || null;
    const assignedTeacher = activeEnrollment?.assignedTeacher || student.currentTeacher || null;
    const totalPaidAmount = roundMoney(payment?._sum?.grossAmount);
    const totalFeeAmount = student.totalFeeAmount == null ? null : roundMoney(student.totalFeeAmount);
    const pendingFeeAmount = totalFeeAmount == null ? null : roundMoney(Math.max(0, totalFeeAmount - totalPaidAmount));
    const attendanceRate = attendance.totalSessions > 0
      ? roundMoney((attendance.presentCount / attendance.totalSessions) * 100)
      : 0;
    const assignedCourseNames = Array.isArray(student.assignedCourses) && student.assignedCourses.length
      ? student.assignedCourses
        .map((item) => item?.course ? `${item.course.name}${item.course.code ? ` (${item.course.code})` : ""}` : "")
        .filter(Boolean)
      : (student.course ? [`${student.course.name}${student.course.code ? ` (${student.course.code})` : ""}`] : []);

    return {
      admissionNo: student.admissionNo || "",
      fullName: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      gender: student.gender || "",
      dateOfBirth: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : "",
      email: student.email || "",
      guardianName: student.guardianName || "",
      guardianPhone: student.guardianPhone || "",
      guardianEmail: student.guardianEmail || "",
      phonePrimary: student.phonePrimary || "",
      phoneSecondary: student.phoneSecondary || "",
      address: student.address || "",
      state: student.state || "",
      district: student.district || "",
      tehsil: student.tehsil || "",
      centerName: student.hierarchyNode?.name || "",
      centerType: student.hierarchyNode?.type || "",
      levelName: effectiveLevel?.name || "",
      levelRank: effectiveLevel?.rank ?? "",
      courseNames: assignedCourseNames.join(", "),
      activeBatchName: activeEnrollment?.batch?.name || "",
      enrollmentStatus: activeEnrollment?.status || "",
      enrollmentStartDate: activeEnrollment?.startDate ? activeEnrollment.startDate.toISOString().slice(0, 10) : "",
      assignedTeacher: assignedTeacher?.teacherProfile?.fullName || assignedTeacher?.username || assignedTeacher?.email || "",
      totalFeeAmount: totalFeeAmount == null ? "" : totalFeeAmount,
      admissionFeeAmount: student.admissionFeeAmount == null ? "" : roundMoney(student.admissionFeeAmount),
      feeConcessionAmount: student.feeConcessionAmount == null ? "" : roundMoney(student.feeConcessionAmount),
      totalPaidAmount,
      pendingFeeAmount: pendingFeeAmount == null ? "" : pendingFeeAmount,
      feeStatus: totalFeeAmount == null ? "NOT_SET" : pendingFeeAmount === 0 ? "PAID" : "PENDING",
      paymentCount: toPlainNumber(payment?._count?._all),
      lastPaymentDate: payment?._max?.receivedAt
        ? new Date(payment._max.receivedAt).toISOString().slice(0, 10)
        : payment?._max?.createdAt
          ? new Date(payment._max.createdAt).toISOString().slice(0, 10)
          : "",
      attendanceSessions: attendance.totalSessions,
      attendancePresent: attendance.presentCount,
      attendanceAbsent: attendance.absentCount,
      attendanceLate: attendance.lateCount,
      attendanceExcused: attendance.excusedCount,
      attendanceRate,
      isActive: student.isActive ? "true" : "false",
      createdAt: student.createdAt?.toISOString?.() || String(student.createdAt),
      updatedAt: student.updatedAt?.toISOString?.() || String(student.updatedAt)
    };
  });
}

async function writeStudentExportWorkbook(res, rows) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  worksheet.columns = STUDENT_EXPORT_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(16, column.header.length + 4)
  }));

  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((row) => {
    worksheet.addRow(row);
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=students_detailed.xlsx");
  await workbook.xlsx.write(res);
  res.end();
}

async function resolveImportLevelId({ tx, tenantId, requestedLevelId, requestedLevelRank, requestedLevelName, fallbackLevelId }) {
  if (requestedLevelId) {
    const level = await tx.level.findFirst({
      where: { tenantId, id: String(requestedLevelId) },
      select: { id: true }
    });
    if (!level) {
      throw makeApiError(404, "Level not found", "LEVEL_NOT_FOUND");
    }
    return level.id;
  }

  if (requestedLevelRank) {
    const rank = Number(requestedLevelRank);
    if (!Number.isFinite(rank)) {
      throw makeApiError(400, "levelRank must be numeric", "VALIDATION_ERROR");
    }
    const level = await tx.level.findFirst({
      where: { tenantId, rank },
      select: { id: true }
    });
    if (!level) {
      throw makeApiError(404, "Level not found", "LEVEL_NOT_FOUND");
    }
    return level.id;
  }

  if (requestedLevelName) {
    const level = await tx.level.findFirst({
      where: { tenantId, name: String(requestedLevelName) },
      orderBy: { rank: "asc" },
      select: { id: true }
    });
    if (!level) {
      throw makeApiError(404, "Level not found", "LEVEL_NOT_FOUND");
    }
    return level.id;
  }

  if (!fallbackLevelId) {
    throw makeApiError(400, "levelId is required", "LEVEL_NOT_FOUND");
  }
  return String(fallbackLevelId);
}

async function resolveImportBatch({ tx, tenantId, hierarchyNodeId, requestedBatchId, requestedBatchName, fallbackBatchId }) {
  const batchId = requestedBatchId || fallbackBatchId;
  if (batchId) {
    const batch = await tx.batch.findFirst({
      where: {
        tenantId,
        hierarchyNodeId,
        id: String(batchId)
      },
      select: { id: true, hierarchyNodeId: true }
    });
    if (!batch) {
      throw makeApiError(404, "Batch not found", "BATCH_NOT_FOUND");
    }
    return batch;
  }

  if (requestedBatchName) {
    const batch = await tx.batch.findFirst({
      where: {
        tenantId,
        hierarchyNodeId,
        name: String(requestedBatchName)
      },
      select: { id: true, hierarchyNodeId: true }
    });
    if (!batch) {
      throw makeApiError(404, "Batch not found", "BATCH_NOT_FOUND");
    }
    return batch;
  }

  throw makeApiError(400, "batchId or batchName is required for enrollment import", "VALIDATION_ERROR");
}

async function resolveImportTeacherId({ tx, tenantId, hierarchyNodeId, requestedTeacherUserId, requestedTeacherUsername, requestedTeacherEmail, fallbackTeacherUserId }) {
  const teacherUserId = requestedTeacherUserId || fallbackTeacherUserId;
  if (teacherUserId) {
    const teacher = await tx.authUser.findFirst({
      where: {
        tenantId,
        hierarchyNodeId,
        role: "TEACHER",
        isActive: true,
        id: String(teacherUserId)
      },
      select: { id: true }
    });
    if (!teacher) {
      throw makeApiError(400, "Invalid assigned teacher", "INVALID_TEACHER");
    }
    return teacher.id;
  }

  if (requestedTeacherUsername || requestedTeacherEmail) {
    const teacher = await tx.authUser.findFirst({
      where: {
        tenantId,
        hierarchyNodeId,
        role: "TEACHER",
        isActive: true,
        OR: [
          requestedTeacherUsername ? { username: String(requestedTeacherUsername) } : undefined,
          requestedTeacherEmail ? { email: String(requestedTeacherEmail) } : undefined
        ].filter(Boolean)
      },
      select: { id: true }
    });
    if (!teacher) {
      throw makeApiError(400, "Invalid assigned teacher", "INVALID_TEACHER");
    }
    return teacher.id;
  }

  return null;
}

async function generateNextStudentCode({ tx, tenantId, prefix = "ST" }) {
  const normalizedPrefix = String(prefix || "").trim();
  if (!/^[A-Z]{1,8}$/.test(normalizedPrefix)) {
    throw new Error("Invalid student code prefix");
  }

  const collectCodeStats = (values, field) => {
    let maxNum = 0;
    let maxWidth = 0;

    for (const value of values) {
      const candidate = String(value?.[field] || "").trim();
      if (!candidate.startsWith(normalizedPrefix)) {
        continue;
      }

      const digits = candidate.slice(normalizedPrefix.length);
      if (!/^\d+$/.test(digits)) {
        continue;
      }

      const numericValue = Number.parseInt(digits, 10);
      if (!Number.isFinite(numericValue)) {
        continue;
      }

      if (numericValue > maxNum) {
        maxNum = numericValue;
      }

      if (digits.length > maxWidth) {
        maxWidth = digits.length;
      }
    }

    return { maxNum, maxWidth };
  };

  const [students, users] = await Promise.all([
    tx.student.findMany({
      where: {
        tenantId,
        admissionNo: { startsWith: normalizedPrefix }
      },
      select: { admissionNo: true }
    }).catch((error) => {
      if (!isSchemaDriftError(error)) {
        throw error;
      }

      return [];
    }),
    tx.authUser.findMany({
      where: {
        tenantId,
        username: { startsWith: normalizedPrefix }
      },
      select: { username: true }
    }).catch((error) => {
      if (!isSchemaDriftError(error)) {
        throw error;
      }

      return [];
    })
  ]);

  const studentStats = collectCodeStats(students, "admissionNo");
  const userStats = collectCodeStats(users, "username");

  const maxNum = Math.max(studentStats.maxNum, userStats.maxNum);
  const nextNum = maxNum + 1;

  const width = Math.max(
    4,
    studentStats.maxWidth,
    userStats.maxWidth,
    String(nextNum).length
  );

  return formatStudentCode(normalizedPrefix, nextNum, width);
}

const getNextStudentCode = asyncHandler(async (req, res) => {
  // Preview only; final allocation happens during createStudent with collision retries.
  const code = await prisma.$transaction(async (tx) => {
    return generateNextStudentCode({ tx, tenantId: req.auth.tenantId, prefix: "ST" });
  });

  return res.apiSuccess("Next student code", { admissionNo: code });
});

const listStudents = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const where = {
    tenantId: req.auth.tenantId
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const q = req.query.q ? String(req.query.q).trim() : "";
  if (q) {
    where.OR = [
      { admissionNo: { contains: q } },
      { firstName: { contains: q } },
      { lastName: { contains: q } }
    ];
  }

  const active = normalizeActiveStatus(req.query.status);
  if (active !== null) {
    where.isActive = active;
  }

  if (req.query.levelId) {
    where.levelId = String(req.query.levelId);
  }

  const teacherUserId = req.query.teacherUserId ? String(req.query.teacherUserId) : "";
  if (teacherUserId) {
    where.batchEnrollments = {
      some: {
        status: "ACTIVE",
        assignedTeacherUserId: teacherUserId
      }
    };
  }

  const courseCode = req.query.courseCode ? String(req.query.courseCode).trim() : "";
  if (courseCode) {
    where.level = {
      is: {
        name: { contains: courseCode }
      }
    };
  }

  const total = await prisma.student.count({ where });

  let data;
  const includeRich = {
    hierarchyNode: { select: { id: true, name: true, type: true } },
    level: { select: { id: true, name: true, rank: true } },
    course: { select: { id: true, code: true, name: true } },
    assignedCourses: {
      select: {
        id: true,
        courseId: true,
        course: { select: { id: true, code: true, name: true } }
      }
    },
    currentTeacher: {
      select: {
        id: true,
        username: true,
        email: true,
        teacherProfile: { select: { fullName: true } }
      }
    },
    authUsers: { select: { id: true, username: true, email: true, isActive: true, role: true } },
    batchEnrollments: {
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        batch: { select: { id: true, name: true } },
        assignedTeacher: {
          select: {
            id: true,
            username: true,
            email: true,
            teacherProfile: { select: { fullName: true } }
          }
        }
      }
    }
  };

  try {
    data = await prisma.student.findMany({
      where,
      orderBy,
      skip,
      take,
      include: includeRich
    });
  } catch (error) {
    // Local/dev DB can miss StudentAssignedCourse table in partial schema state.
    if (error?.code !== "P2021" && error?.code !== "P2022") {
      throw error;
    }

    const includeFallback = {
      ...includeRich,
      assignedCourses: false
    };

    data = await prisma.student.findMany({
      where,
      orderBy,
      skip,
      take,
      include: includeFallback
    });
  }

  res.setHeader("X-Pagination-Limit", String(limit));
  res.setHeader("X-Pagination-Offset", String(offset));
  res.setHeader("X-Pagination-Total", String(total));

  return res.apiSuccess("Students fetched", data);
});

const getStudent = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const where = {
    id: studentId,
    tenantId: req.auth.tenantId
  };

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId) {
    where.hierarchyNodeId = req.auth.hierarchyNodeId;
  }

  const includeRich = {
    hierarchyNode: { select: { id: true, name: true, type: true } },
    level: { select: { id: true, name: true, rank: true } },
    course: { select: { id: true, code: true, name: true } },
    assignedCourses: {
      select: {
        id: true,
        courseId: true,
        course: { select: { id: true, code: true, name: true } }
      }
    },
    currentTeacher: {
      select: {
        id: true,
        username: true,
        email: true,
        teacherProfile: { select: { fullName: true } }
      }
    },
    authUsers: { select: { id: true, username: true, email: true, isActive: true, role: true } },
    batchEnrollments: {
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 1,
      include: {
        batch: { select: { id: true, name: true } },
        assignedTeacher: {
          select: {
            id: true,
            username: true,
            email: true,
            teacherProfile: { select: { fullName: true } }
          }
        }
      }
    }
  };

  let student;
  try {
    student = await prisma.student.findFirst({
      where,
      include: includeRich
    });
  } catch (error) {
    // Local/dev DB can miss StudentAssignedCourse table in partial schema state.
    if (error?.code !== "P2021" && error?.code !== "P2022") {
      throw error;
    }

    const includeFallback = {
      ...includeRich,
      assignedCourses: false
    };

    student = await prisma.student.findFirst({
      where,
      include: includeFallback
    });
  }

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  return res.apiSuccess("Student fetched", student);
});

const listStudentNotes = asyncHandler(async (req, res) => {
  const { take, skip, orderBy, limit, offset } = parsePagination(req.query);

  const studentId = String(req.params.id);
  const scopeEntity = req.scopeEntity;
  const tenantId = scopeEntity?.tenantId || req.auth.tenantId;
  const hierarchyNodeId = scopeEntity?.hierarchyNodeId || null;

  const q = req.query.q ? String(req.query.q).trim() : "";
  const from = req.query.from ? parseIsoDateOnly(req.query.from) : null;
  const to = req.query.to ? parseIsoDateOnly(req.query.to) : null;

  const where = {
    tenantId,
    studentId,
    isDeleted: false,
    ...(hierarchyNodeId ? { hierarchyNodeId } : {}),
    ...(q ? { note: { contains: q } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {})
          }
        }
      : {})
  };

  const [total, items] = await Promise.all([
    prisma.teacherNote.count({ where }),
    prisma.teacherNote.findMany({
      where,
      take,
      skip,
      orderBy,
      select: {
        id: true,
        note: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        teacher: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            teacherProfile: { select: { fullName: true } }
          }
        }
      }
    })
  ]);

  return res.apiSuccess("Student notes", {
    items,
    total,
    limit,
    offset
  });
});

const createStudentNote = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const note = req.body?.note;
  const tags = req.body?.tags;

  if (!note || !String(note).trim()) {
    return res.apiError(400, "note is required", "VALIDATION_ERROR");
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role === "CENTER" && req.auth.hierarchyNodeId && student.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const created = await prisma.teacherNote.create({
    data: {
      tenantId: req.auth.tenantId,
      hierarchyNodeId: student.hierarchyNodeId,
      teacherUserId: req.auth.userId,
      studentId: student.id,
      note: String(note).trim(),
      ...(tags !== undefined ? { tags: normalizeNoteTags(tags) } : {})
    }
  });

  res.locals.entityId = created.id;
  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "STUDENT_NOTE_CREATE",
    entityType: "TEACHER_NOTE",
    entityId: created.id,
    metadata: { studentId: student.id }
  });

  return res.apiSuccess("Note created", created, 201);
});

const updateStudentNote = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const noteId = String(req.params.noteId || "").trim();
  if (!noteId) {
    return res.apiError(400, "noteId is required", "VALIDATION_ERROR");
  }

  const existing = await prisma.teacherNote.findFirst({
    where: {
      id: noteId,
      tenantId: req.auth.tenantId,
      isDeleted: false,
      ...(req.auth.role === "CENTER" && req.auth.hierarchyNodeId ? { hierarchyNodeId: req.auth.hierarchyNodeId } : {})
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Note not found", "NOTE_NOT_FOUND");
  }

  const note = req.body?.note;
  const tags = req.body?.tags;

  const updated = await prisma.teacherNote.update({
    where: { id: existing.id },
    data: {
      ...(note !== undefined ? { note: String(note || "").trim() } : {}),
      ...(tags !== undefined ? { tags: normalizeNoteTags(tags) } : {})
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "STUDENT_NOTE_UPDATE",
    entityType: "TEACHER_NOTE",
    entityId: updated.id
  });

  return res.apiSuccess("Note updated", updated);
});

const deleteStudentNote = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const noteId = String(req.params.noteId || "").trim();
  if (!noteId) {
    return res.apiError(400, "noteId is required", "VALIDATION_ERROR");
  }

  const existing = await prisma.teacherNote.findFirst({
    where: {
      id: noteId,
      tenantId: req.auth.tenantId,
      isDeleted: false,
      ...(req.auth.role === "CENTER" && req.auth.hierarchyNodeId ? { hierarchyNodeId: req.auth.hierarchyNodeId } : {})
    },
    select: { id: true }
  });

  if (!existing) {
    return res.apiError(404, "Note not found", "NOTE_NOT_FOUND");
  }

  const updated = await prisma.teacherNote.update({
    where: { id: existing.id },
    data: {
      isDeleted: true,
      deletedAt: new Date()
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "STUDENT_NOTE_DELETE",
    entityType: "TEACHER_NOTE",
    entityId: updated.id
  });

  return res.apiSuccess("Note deleted", null);
});

const exportStudentNotesCsv = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const q = req.query.q ? String(req.query.q).trim() : "";
  const from = req.query.from ? parseIsoDateOnly(req.query.from) : null;
  const to = req.query.to ? parseIsoDateOnly(req.query.to) : null;

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: req.auth.tenantId },
    select: { id: true, admissionNo: true, hierarchyNodeId: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role === "CENTER" && req.auth.hierarchyNodeId && student.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Forbidden", "ROLE_FORBIDDEN");
  }

  const where = {
    tenantId: req.auth.tenantId,
    studentId: student.id,
    isDeleted: false,
    ...(req.auth.role === "CENTER" && req.auth.hierarchyNodeId ? { hierarchyNodeId: req.auth.hierarchyNodeId } : {}),
    ...(q ? { note: { contains: q } } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1) } : {})
          }
        }
      : {})
  };

  const notes = await prisma.teacherNote.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      note: true,
      tags: true,
      createdAt: true,
      updatedAt: true,
      teacher: {
        select: {
          id: true,
          username: true,
          email: true,
          teacherProfile: { select: { fullName: true } }
        }
      }
    }
  });

  const csv = toCsv({
    headers: ["createdAt", "updatedAt", "author", "note", "tags"],
    rows: notes.map((n) => {
      const author = n?.teacher?.teacherProfile?.fullName || n?.teacher?.username || n?.teacher?.email || "";
      return [
        n.createdAt?.toISOString?.() || String(n.createdAt),
        n.updatedAt?.toISOString?.() || String(n.updatedAt),
        author,
        n.note,
        n.tags != null ? JSON.stringify(n.tags) : ""
      ];
    })
  });

  const safeName = (student.admissionNo || student.id || "student").replace(/[^a-zA-Z0-9_-]/g, "_");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename=${safeName}-notes.csv`);
  return res.status(200).send(csv);
});

const exportStudentsCsv = asyncHandler(async (req, res) => {
  const where = getStudentExportWhere(req);
  const rows = await buildDetailedStudentExportRows(where);

  const csv = toCsv({
    headers: STUDENT_EXPORT_COLUMNS.map((column) => column.header),
    rows: rows.map((row) => STUDENT_EXPORT_COLUMNS.map((column) => row[column.key] ?? ""))
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=students_detailed.csv");
  return res.status(200).send(csv);
});

const exportStudentsExcel = asyncHandler(async (req, res) => {
  const where = getStudentExportWhere(req);
  const rows = await buildDetailedStudentExportRows(where);
  await writeStudentExportWorkbook(res, rows);
});

const createStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const {
    admissionNo,
    firstName,
    lastName,
    gender,
    email,
    dateOfBirth,
    hierarchyNodeId: requestedHierarchyNodeId,
    levelId: requestedLevelId,
    guardianName,
    guardianPhone,
    guardianEmail,
    phonePrimary,
    phoneSecondary,
    address,
    state,
    district,
    tehsil,
    totalFeeAmount,
    admissionFeeAmount,
    currentTeacherUserId,
    isActive,
    createLoginAccount,
    loginPassword,
    enrollmentFeeAmount
  } = req.body;

  const normalizedTotalFeeAmount = normalizeMoney(totalFeeAmount);
  if (normalizedTotalFeeAmount?.error) {
    return res.apiError(400, normalizedTotalFeeAmount.error, "VALIDATION_ERROR");
  }
  const normalizedAdmissionFeeAmount = normalizeMoney(admissionFeeAmount);
  if (normalizedAdmissionFeeAmount?.error) {
    return res.apiError(400, normalizedAdmissionFeeAmount.error, "VALIDATION_ERROR");
  }

  const hierarchyNodeId = req.auth.role === "SUPERADMIN"
    ? String(requestedHierarchyNodeId || "")
    : String(req.auth.hierarchyNodeId || "");

  if (!hierarchyNodeId) {
    return res.apiError(400, "hierarchyNodeId is required", "HIERARCHY_NODE_REQUIRED");
  }

  const resolvedLevelId = requestedLevelId
    ? String(requestedLevelId)
    : (
      await prisma.level.findFirst({
        where: { tenantId: req.auth.tenantId },
        orderBy: { rank: "asc" },
        select: { id: true }
      })
    )?.id;

  if (!resolvedLevelId) {
    return res.apiError(400, "No levels configured for tenant", "LEVELS_MISSING");
  }

  // Student email is optional; username/password login works without email.

  const normalizedGender = gender ? String(gender).trim().toUpperCase() : null;
  if (normalizedGender && !["MALE", "FEMALE", "OTHER"].includes(normalizedGender)) {
    return res.apiError(400, "gender must be MALE, FEMALE, or OTHER", "VALIDATION_ERROR");
  }

  const requestedAdmissionNo = normalizeAdmissionNo(admissionNo);
  const shouldAutoGenerateAdmissionNo = req.auth.role === "CENTER" && !requestedAdmissionNo;

  if (!shouldAutoGenerateAdmissionNo && !requestedAdmissionNo) {
    return res.apiError(400, "admissionNo is required", "STUDENT_CODE_REQUIRED");
  }

  const shouldCreateLogin = Boolean(createLoginAccount);

  if (shouldCreateLogin && !loginPassword && shouldAutoGenerateAdmissionNo === false && !requestedAdmissionNo) {
    return res.apiError(400, "loginPassword (or admissionNo) is required to create login", "STUDENT_PASSWORD_REQUIRED");
  }

  const created = await prisma.$transaction(async (tx) => {
    await validateInitialStudentLevel({
      tx,
      tenantId: req.auth.tenantId,
      levelId: resolvedLevelId
    });

    const levelDefaults = await getLevelFeeDefaults({ tx, tenantId: req.auth.tenantId, levelId: resolvedLevelId });

    let resolvedCurrentTeacherUserId = currentTeacherUserId ? String(currentTeacherUserId) : null;
    if (resolvedCurrentTeacherUserId) {
      const teacher = await tx.authUser.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          id: resolvedCurrentTeacherUserId,
          role: "TEACHER",
          isActive: true,
          hierarchyNodeId
        },
        select: { id: true }
      });

      if (!teacher) {
        return res.apiError(400, "currentTeacherUserId is not a valid active teacher for this center", "TEACHER_NOT_FOUND");
      }
    }

    let finalAdmissionNo = shouldAutoGenerateAdmissionNo
      ? await generateNextStudentCode({ tx, tenantId: req.auth.tenantId, prefix: "ST" })
      : requestedAdmissionNo;
    let compatibilityMode = false;

    // If client did not send loginPassword, default to the final admissionNo.
    const tempPassword = shouldCreateLogin ? String(loginPassword || finalAdmissionNo || "").trim() : null;
    if (shouldCreateLogin && !tempPassword) {
      return res.apiError(400, "loginPassword (or admissionNo) is required to create login", "STUDENT_PASSWORD_REQUIRED");
    }

    // Create student with retry on admissionNo collisions (tenantId+admissionNo is unique).
    let student = null;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        student = await tx.student.create({
          data: buildStudentCreateData({
            tenantId: req.auth.tenantId,
            admissionNo: finalAdmissionNo,
            firstName,
            lastName,
            normalizedGender,
            email,
            dateOfBirth,
            hierarchyNodeId,
            resolvedLevelId,
            guardianName,
            guardianPhone,
            guardianEmail,
            phonePrimary,
            phoneSecondary,
            address,
            state,
            district,
            tehsil,
            normalizedTotalFeeAmount,
            normalizedAdmissionFeeAmount,
            levelDefaults,
            resolvedCurrentTeacherUserId,
            isActive,
            compatibilityMode
          })
        });
        break;
      } catch (err) {
        if (isSchemaMismatchError(err, ["student", "feeconcessionamount", "currentteacheruserid"])) {
          if (!compatibilityMode) {
            compatibilityMode = true;
            continue;
          }

          throw makeApiError(503, "Student admission storage is unavailable until database migrations are applied", "STUDENT_SCHEMA_MISSING");
        }

        if (!isUniqueConstraintError(err)) {
          throw err;
        }

        // If email is duplicated, do NOT retry (changing admissionNo won't help).
        if (isStudentEmailUniqueCollision(err)) {
          throw makeApiError(409, "Student email already exists", "STUDENT_EMAIL_EXISTS");
        }

        // Only retry on admissionNo collisions when we are auto-generating.
        if (!shouldAutoGenerateAdmissionNo || !isAdmissionNoUniqueCollision(err)) {
          throw err;
        }

        // eslint-disable-next-line no-await-in-loop
        finalAdmissionNo = await generateNextStudentCode({ tx, tenantId: req.auth.tenantId, prefix: "ST" });
      }
    }

    if (!student) {
      // Fallback: try creating with a timestamp-randomized admissionNo to avoid blocking
      const fallbackAdmissionNo = `${String(finalAdmissionNo || "ST").slice(0, 16)}${Date.now()}${Math.floor(Math.random() * 10000)}`;
      try {
        student = await tx.student.create({
          data: buildStudentCreateData({
            tenantId: req.auth.tenantId,
            admissionNo: fallbackAdmissionNo,
            firstName,
            lastName,
            normalizedGender,
            email,
            dateOfBirth,
            hierarchyNodeId,
            resolvedLevelId,
            guardianName,
            guardianPhone,
            guardianEmail,
            phonePrimary,
            phoneSecondary,
            address,
            state,
            district,
            tehsil,
            normalizedTotalFeeAmount,
            normalizedAdmissionFeeAmount,
            levelDefaults,
            resolvedCurrentTeacherUserId,
            isActive,
            compatibilityMode: true
          })
        });
      } catch (err) {
        if (isStudentEmailUniqueCollision(err)) {
          throw makeApiError(409, "Student email already exists", "STUDENT_EMAIL_EXISTS");
        }
        if (isSchemaMismatchError(err, ["student", "feeconcessionamount", "currentteacheruserid"])) {
          throw makeApiError(503, "Student admission storage is unavailable until database migrations are applied", "STUDENT_SCHEMA_MISSING");
        }
        throw makeApiError(503, "Unable to allocate a unique student code. Please retry.", "STUDENT_CODE_GENERATION_FAILED");
      }
    }

    let createdLogin = null;
    if (shouldCreateLogin) {
      const passwordHash = await hashPassword(tempPassword);
      try {
        createdLogin = await tx.authUser.create({
          data: {
            tenantId: req.auth.tenantId,
            email: email ? String(email) : makeStudentPlaceholderEmail({ tenantId: req.auth.tenantId, studentId: student.id }),
            username: String(finalAdmissionNo),
            role: "STUDENT",
            passwordHash,
            isActive: true,
            mustChangePassword: true,
            studentId: student.id,
            parentUserId: req.auth.userId,
            hierarchyNodeId
          },
          select: { id: true, username: true, email: true }
        });
      } catch (err) {
        if (isUniqueConstraintError(err) && uniqueTargetsInclude(err, "email")) {
          throw makeApiError(409, "Email already used by another account", "AUTH_EMAIL_EXISTS");
        }
        if (isUniqueConstraintError(err) && uniqueTargetsInclude(err, "username")) {
          throw makeApiError(409, "Student code already used by another account", "AUTH_USERNAME_EXISTS");
        }
        throw err;
      }
    }

    try {
      await recordEnrollmentTransaction({
        tx,
        tenantId: req.auth.tenantId,
        studentId: student.id,
        actorUserId: req.auth.userId,
        grossAmount: enrollmentFeeAmount ?? 0
      });
    } catch (error) {
      if (!isSchemaMismatchError(error, ["financialtransaction", "studentfeeinstallment", "settlement"])) {
        throw error;
      }
    }

    return { student, createdLogin, tempPassword };
  });

  res.locals.entityId = created.student.id;
  return res.apiSuccess(
    "Student created",
    {
      ...created.student,
      createdLogin: created.createdLogin,
      tempPassword: shouldCreateLogin ? created.tempPassword : null
    },
    201
  );
});

const updateStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const {
    admissionNo,
    firstName,
    lastName,
    email,
    dateOfBirth,
    guardianName,
    guardianPhone,
    guardianEmail,
    gender,
    phonePrimary,
    phoneSecondary,
    address,
    state,
    district,
    tehsil,
    totalFeeAmount,
    admissionFeeAmount,
    feeConcessionAmount,
    feeChangeNote,
    levelId,
    currentTeacherUserId,
    isActive
  } = req.body;

  const normalizedTotalFeeAmount = normalizeMoney(totalFeeAmount);
  if (normalizedTotalFeeAmount?.error) {
    return res.apiError(400, normalizedTotalFeeAmount.error, "VALIDATION_ERROR");
  }
  const normalizedAdmissionFeeAmount = normalizeMoney(admissionFeeAmount);
  if (normalizedAdmissionFeeAmount?.error) {
    return res.apiError(400, normalizedAdmissionFeeAmount.error, "VALIDATION_ERROR");
  }

  const normalizedFeeConcessionAmount = normalizeConcessionAmount(feeConcessionAmount);
  if (normalizedFeeConcessionAmount?.error) {
    return res.apiError(400, normalizedFeeConcessionAmount.error, "VALIDATION_ERROR");
  }

  const existing = await prisma.student.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      hierarchyNodeId: true,
      levelId: true,
      feeConcessionAmount: true,
      totalFeeAmount: true,
      admissionFeeAmount: true
    }
  });

  if (!existing) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && existing.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const normalizedGender = gender !== undefined && gender !== null && gender !== ""
    ? String(gender).trim().toUpperCase()
    : null;

  if (normalizedGender && !["MALE", "FEMALE", "OTHER"].includes(normalizedGender)) {
    return res.apiError(400, "gender must be MALE, FEMALE, or OTHER", "VALIDATION_ERROR");
  }

  if (currentTeacherUserId !== undefined) {
    const nextTeacherId = currentTeacherUserId ? String(currentTeacherUserId) : null;
    if (nextTeacherId) {
      const teacher = await prisma.authUser.findFirst({
        where: {
          tenantId: req.auth.tenantId,
          id: nextTeacherId,
          role: "TEACHER",
          isActive: true,
          hierarchyNodeId: existing.hierarchyNodeId
        },
        select: { id: true }
      });

      if (!teacher) {
        return res.apiError(400, "currentTeacherUserId is not a valid active teacher for this center", "TEACHER_NOT_FOUND");
      }
    }
  }

  const feeFieldsProvided = normalizedTotalFeeAmount !== undefined
    || normalizedAdmissionFeeAmount !== undefined
    || normalizedFeeConcessionAmount !== undefined;
  const noteText = String(feeChangeNote || "").trim();
  if (feeFieldsProvided && !noteText) {
    return res.apiError(400, "feeChangeNote is required when changing student fees", "VALIDATION_ERROR");
  }

  let feeUpdateData = {};
  if (normalizedTotalFeeAmount !== undefined) {
    feeUpdateData.totalFeeAmount = normalizedTotalFeeAmount;
  }
  if (normalizedAdmissionFeeAmount !== undefined) {
    feeUpdateData.admissionFeeAmount = normalizedAdmissionFeeAmount;
  }
  if (normalizedFeeConcessionAmount !== undefined) {
    feeUpdateData.feeConcessionAmount = normalizedFeeConcessionAmount;
  }

  const effectiveTotalFeeAmount = feeUpdateData.totalFeeAmount !== undefined
    ? feeUpdateData.totalFeeAmount
    : (existing.totalFeeAmount == null ? null : Number(existing.totalFeeAmount));
  const effectiveAdmissionFeeAmount = feeUpdateData.admissionFeeAmount !== undefined
    ? feeUpdateData.admissionFeeAmount
    : (existing.admissionFeeAmount == null ? null : Number(existing.admissionFeeAmount));

  if (effectiveAdmissionFeeAmount !== null && effectiveTotalFeeAmount === null) {
    return res.apiError(400, "admissionFeeAmount requires totalFeeAmount", "VALIDATION_ERROR");
  }

  if (
    effectiveAdmissionFeeAmount !== null &&
    effectiveTotalFeeAmount !== null &&
    Number(effectiveAdmissionFeeAmount) > Number(effectiveTotalFeeAmount)
  ) {
    return res.apiError(400, "admissionFeeAmount must be less than or equal to totalFeeAmount", "VALIDATION_ERROR");
  }

  const updateData = {
    ...(admissionNo !== undefined ? { admissionNo: String(admissionNo) } : {}),
    ...(firstName !== undefined ? { firstName: String(firstName) } : {}),
    ...(lastName !== undefined ? { lastName: String(lastName) } : {}),
    ...(email !== undefined ? { email: email ? String(email) : null } : {}),
    ...(dateOfBirth !== undefined ? { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null } : {}),
    ...(guardianName !== undefined ? { guardianName: guardianName ? String(guardianName) : null } : {}),
    ...(guardianPhone !== undefined ? { guardianPhone: guardianPhone ? String(guardianPhone) : null } : {}),
    ...(guardianEmail !== undefined ? { guardianEmail: guardianEmail ? String(guardianEmail) : null } : {}),
    ...(gender !== undefined ? { gender: normalizedGender } : {}),
    ...(phonePrimary !== undefined ? { phonePrimary: phonePrimary ? String(phonePrimary) : null } : {}),
    ...(phoneSecondary !== undefined ? { phoneSecondary: phoneSecondary ? String(phoneSecondary) : null } : {}),
    ...(address !== undefined ? { address: address ? String(address) : null } : {}),
    ...(state !== undefined ? { state: state ? String(state) : null } : {}),
    ...(district !== undefined ? { district: district ? String(district) : null } : {}),
    ...(tehsil !== undefined ? { tehsil: tehsil ? String(tehsil) : null } : {}),
    ...(levelId !== undefined ? { levelId: String(levelId) } : {}),
    ...feeUpdateData,
    ...(currentTeacherUserId !== undefined ? { currentTeacherUserId: currentTeacherUserId ? String(currentTeacherUserId) : null } : {}),
    ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {})
  };

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.student.update({
      where: { id },
      data: updateData,
      include: {
        level: { select: { id: true, name: true, rank: true } },
        hierarchyNode: { select: { id: true, name: true, type: true } }
      }
    });

    if (feeFieldsProvided) {
      await tx.teacherNote.create({
        data: {
          tenantId: req.auth.tenantId,
          hierarchyNodeId: existing.hierarchyNodeId,
          teacherUserId: req.auth.userId,
          studentId: existing.id,
          note: `Student fee updated. ${noteText}`,
          tags: {
            category: "FEE_CHANGE",
            previousConcessionAmount: Number(existing.feeConcessionAmount || 0),
            nextConcessionAmount: result.feeConcessionAmount == null ? null : Number(result.feeConcessionAmount),
            previousTotalFeeAmount: existing.totalFeeAmount == null ? null : Number(existing.totalFeeAmount),
            nextTotalFeeAmount: result.totalFeeAmount == null ? null : Number(result.totalFeeAmount),
            previousAdmissionFeeAmount: existing.admissionFeeAmount == null ? null : Number(existing.admissionFeeAmount),
            nextAdmissionFeeAmount: result.admissionFeeAmount == null ? null : Number(result.admissionFeeAmount)
          }
        }
      });
    }

    return result;
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Student updated", updated);
});

const uploadStudentPhoto = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const file = req.file;
  if (!file?.filename) {
    return res.apiError(400, "file is required", "FILE_REQUIRED");
  }

  const url = buildUploadUrl(req, `/uploads/student-photos/${file.filename}`);

  const updated = await prisma.student.update({
    where: { id },
    data: {
      photoUrl: url
    },
    select: { id: true, photoUrl: true }
  });

  res.locals.entityId = updated.id;
  return res.apiSuccess("Student photo uploaded", updated);
});

const createStudentFeePayment = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const type = req.body?.type;
  const grossAmount = req.body?.grossAmount;
  const paymentMode = req.body?.paymentMode;
  const receivedAt = req.body?.receivedAt;
  const feeScheduleType = req.body?.feeScheduleType;
  const feeMonth = req.body?.feeMonth;
  const feeYear = req.body?.feeYear;
  const feeLevelId = req.body?.feeLevelId;
  const paymentReference = req.body?.paymentReference;
  const installmentId = req.body?.installmentId;

  // Ensure student exists and is in-scope (CENTER scope enforced by requireScopeAccess in route).
  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const created = await prisma.$transaction((tx) =>
    recordStudentPaymentTransaction({
      tx,
      tenantId: req.auth.tenantId,
      studentId: student.id,
      actorUserId: req.auth.userId,
      type,
      grossAmount,
      paymentMode,
      receivedAt,
      feeScheduleType,
      feeMonth,
      feeYear,
      feeLevelId,
      paymentReference,
      installmentId
    })
  );

  res.locals.entityId = created.id;
  return res.apiSuccess("Payment recorded", created, 201);
});

const getStudentFeesContext = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      totalFeeAmount: true,
      admissionFeeAmount: true,
      feeConcessionAmount: true,
      levelId: true,
      level: {
        select: {
          id: true,
          name: true,
          rank: true,
          defaultTotalFeeAmount: true,
          defaultAdmissionFeeAmount: true
        }
      }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const installments = await prisma.studentFeeInstallment.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: student.id
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      dueDate: true,
      createdAt: true,
      updatedAt: true
    }
  });

  const payments = await prisma.financialTransaction.findMany({
    where: {
      tenantId: req.auth.tenantId,
      studentId: student.id,
      type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      type: true,
      grossAmount: true,
      paymentMode: true,
      receivedAt: true,
      paymentReference: true,
      feeScheduleType: true,
      feeMonth: true,
      feeYear: true,
      feeLevelId: true,
      installmentId: true,
      createdAt: true,
      createdBy: { select: { id: true, username: true, email: true, role: true } },
      feeLevel: { select: { id: true, name: true, rank: true } },
      installment: { select: { id: true, dueDate: true, amount: true } }
    }
  });

  const paidTotal = payments.reduce(
    (sum, p) => (p.type === "ENROLLMENT" || p.type === "RENEWAL" ? sum + Number(p.grossAmount || 0) : sum),
    0
  );
  const totalFee = student.totalFeeAmount == null ? null : Number(student.totalFeeAmount);
  const pendingTotal = totalFee == null ? null : Math.max(0, Number((totalFee - paidTotal).toFixed(2)));

  const paidByInstallmentId = new Map();
  for (const payment of payments) {
    if (payment.type !== "ENROLLMENT" && payment.type !== "RENEWAL") continue;
    if (!payment.installmentId) continue;
    const prev = paidByInstallmentId.get(payment.installmentId) || 0;
    paidByInstallmentId.set(payment.installmentId, prev + Number(payment.grossAmount || 0));
  }

  const now = new Date();
  const installmentItems = installments.map((inst) => {
    const amount = Number(inst.amount || 0);
    const paid = Number((paidByInstallmentId.get(inst.id) || 0).toFixed(2));
    const pending = Math.max(0, Number((amount - paid).toFixed(2)));

    let status = "PENDING";
    if (paid >= amount && amount > 0) {
      status = "PAID";
    } else if (paid > 0) {
      status = "PARTIAL";
    } else if (inst.dueDate && inst.dueDate < now) {
      status = "OVERDUE";
    }

    return {
      ...inst,
      paid,
      pending,
      status
    };
  });

  return res.apiSuccess("Student fees context", {
    student: {
      id: student.id,
      admissionNo: student.admissionNo,
      fullName: `${student.firstName || ""} ${student.lastName || ""}`.trim(),
      totalFeeAmount: student.totalFeeAmount,
      admissionFeeAmount: student.admissionFeeAmount,
      feeConcessionAmount: student.feeConcessionAmount,
      levelId: student.levelId,
      level: student.level
    },
    summary: {
      totalFee,
      paid: Number(paidTotal.toFixed(2)),
      pending: pendingTotal,
      status: totalFee == null ? null : pendingTotal === 0 ? "PAID" : "PENDING"
    },
    installments: installmentItems,
    payments
  });
});

const upsertStudentInstallment = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const studentId = String(req.params.id || "").trim();
  if (!studentId) {
    return res.apiError(400, "studentId is required", "VALIDATION_ERROR");
  }

  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.apiError(400, "amount must be > 0", "VALIDATION_ERROR");
  }

  const dueDateRaw = req.body?.dueDate;
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null;
  if (!dueDate || Number.isNaN(dueDate.getTime())) {
    return res.apiError(400, "dueDate must be a valid date", "VALIDATION_ERROR");
  }

  const created = await prisma.studentFeeInstallment.create({
    data: {
      tenantId: req.auth.tenantId,
      studentId,
      amount,
      dueDate
    },
    select: { id: true, amount: true, dueDate: true, createdAt: true }
  });

  res.locals.entityId = created.id;
  return res.apiSuccess("Installment created", created, 201);
});

const deleteStudentInstallment = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const studentId = String(req.params.id || "").trim();
  const installmentId = String(req.params.installmentId || "").trim();
  if (!studentId || !installmentId) {
    return res.apiError(400, "studentId and installmentId are required", "VALIDATION_ERROR");
  }

  const hasPayments = await prisma.financialTransaction.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      studentId,
      installmentId
    },
    select: { id: true }
  });

  if (hasPayments) {
    return res.apiError(409, "Installment has payments; cannot delete", "INSTALLMENT_HAS_PAYMENTS");
  }

  await prisma.studentFeeInstallment.delete({
    where: { id: installmentId }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "STUDENT_INSTALLMENT_DELETE",
    entityType: "FEE_INSTALLMENT",
    entityId: installmentId,
    metadata: { studentId }
  });

  res.locals.entityId = installmentId;
  return res.apiSuccess("Installment deleted", { id: installmentId });
});

const createStudentLogin = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const { password } = req.body;

  const student = await prisma.student.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      email: true,
      admissionNo: true,
      hierarchyNodeId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && student.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  // Email is optional for student logins.

  const existingLogin = await prisma.authUser.findFirst({
    where: { tenantId: req.auth.tenantId, studentId: student.id },
    select: { id: true }
  });

  if (existingLogin) {
    return res.apiError(409, "Student login already exists", "STUDENT_LOGIN_EXISTS");
  }

  const tempPassword = String(password || student.admissionNo || "").trim();
  if (!tempPassword) {
    return res.apiError(400, "password (or admissionNo) is required", "STUDENT_PASSWORD_REQUIRED");
  }

  const passwordHash = await hashPassword(tempPassword);
  const login = await prisma.authUser.create({
    data: {
      tenantId: req.auth.tenantId,
      email: student.email || makeStudentPlaceholderEmail({ tenantId: req.auth.tenantId, studentId: student.id }),
      username: student.admissionNo,
      role: "STUDENT",
      passwordHash,
      isActive: true,
      mustChangePassword: true,
      studentId: student.id,
      parentUserId: req.auth.userId,
      hierarchyNodeId: student.hierarchyNodeId
    },
    select: { id: true, username: true, email: true }
  });

  res.locals.entityId = login.id;
  return res.apiSuccess("Student login created", { login, tempPassword }, 201);
});

const resetStudentPassword = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const { newPassword, mustChangePassword } = req.body || {};

  const student = await prisma.student.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: { id: true, hierarchyNodeId: true, admissionNo: true }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (req.auth.role !== "SUPERADMIN" && req.auth.hierarchyNodeId && student.hierarchyNodeId !== req.auth.hierarchyNodeId) {
    return res.apiError(403, "Hierarchy scope denied", "HIERARCHY_SCOPE_DENIED");
  }

  const login = await prisma.authUser.findFirst({
    where: { tenantId: req.auth.tenantId, studentId: student.id },
    select: { id: true, username: true, email: true }
  });

  if (!login) {
    return res.apiError(404, "Student login not found", "STUDENT_LOGIN_NOT_FOUND");
  }

  const trimmed = newPassword === undefined || newPassword === null ? "" : String(newPassword).trim();
  const tempPassword = trimmed || generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  await prisma.authUser.update({
    where: { id: login.id },
    data: {
      passwordHash,
      mustChangePassword: mustChangePassword !== undefined ? Boolean(mustChangePassword) : true
    }
  });

  res.locals.entityId = login.id;
  return res.apiSuccess("Student password reset", {
    id: login.id,
    username: login.username,
    email: login.email,
    tempPassword: trimmed ? null : tempPassword
  });
});

const assignLevelToStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const { levelId } = req.body;

  const result = await assignLevelWithIntegrity({
    tenantId: req.auth.tenantId,
    studentId: id,
    targetLevelId: levelId,
    actorUserId: req.auth.userId,
    reason: "MANUAL_ASSIGNMENT"
  });

  const studentAfterAssignment = await prisma.student.findUniqueOrThrow({
    where: { id },
    select: { id: true, feeConcessionAmount: true }
  });

  await syncStudentFeeDefaults({
    tx: prisma,
    tenantId: req.auth.tenantId,
    studentId: id,
    levelId,
    feeConcessionAmount: Number(studentAfterAssignment.feeConcessionAmount || 0)
  });

  const updated = await prisma.student.findUniqueOrThrow({
    where: { id },
    include: {
      level: { select: { id: true, name: true, rank: true } }
    }
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "COURSE_ASSIGNMENT",
    entityType: "STUDENT",
    entityId: id,
    metadata: {
      assignedLevelId: levelId,
      previousLevelId: result.previousLevelId,
      changed: result.changed
    }
  });

  return res.apiSuccess("Level assigned to student", updated);
});

const getPromotionStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const queryLevelId = req.query.levelId;

  const student = await prisma.student.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      levelId: true,
      feeConcessionAmount: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const levelId = queryLevelId || student.levelId;
  const passState = await prisma.$transaction(async (tx) =>
    evaluatePassThreshold({
      tx,
      tenantId: req.auth.tenantId,
      studentId: id,
      levelId
    })
  );

  const eligibility = {
    eligible: passState.passed,
    reasons: passState.passed
      ? []
      : [`Score ${passState.score ?? "N/A"} below pass threshold ${passState.threshold}`],
    metrics: {
      threshold: passState.threshold,
      score: passState.score
    }
  };

  if (eligibility.eligible) {
    void (async () => {
      try {
        const studentContext = await prisma.student.findFirst({
          where: {
            id,
            tenantId: req.auth.tenantId
          },
          select: {
            hierarchyNodeId: true
          }
        });

        if (!studentContext) {
          return;
        }

        const recipients = await prisma.authUser.findMany({
          where: {
            tenantId: req.auth.tenantId,
            isActive: true,
            hierarchyNodeId: studentContext.hierarchyNodeId,
            role: {
              in: ["CENTER", "TEACHER"]
            }
          },
          select: {
            id: true
          }
        });

        await createBulkNotification(
          recipients.map((recipient) => ({
            tenantId: req.auth.tenantId,
            recipientUserId: recipient.id,
            type: "PROMOTION_READY",
            title: "Promotion Ready",
            message: `Student ${id} is eligible for promotion`,
            entityType: "STUDENT",
            entityId: id
          }))
        );
      } catch {
        return;
      }
    })();
  }

  return res.apiSuccess("Promotion eligibility calculated", {
    studentId: id,
    levelId,
    ...eligibility
  });
});

const getPerformanceSummary = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const queryLevelId = req.query.levelId;

  const student = await prisma.student.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      levelId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const levelId = queryLevelId || student.levelId;
  const performance = await getLevelPerformance(id, levelId, req.auth.tenantId);

  return res.apiSuccess("Performance summary calculated", performance);
});

const confirmPromotion = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const student = await prisma.student.findFirst({
    where: {
      id,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      levelId: true
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const currentLevel = await prisma.level.findFirst({
    where: {
      id: student.levelId,
      tenantId: req.auth.tenantId
    },
    select: {
      id: true,
      rank: true
    }
  });

  if (!currentLevel) {
    return res.apiError(404, "Current level not found", "CURRENT_LEVEL_NOT_FOUND");
  }

  const nextLevel = await prisma.level.findFirst({
    where: {
      tenantId: req.auth.tenantId,
      rank: currentLevel.rank + 1
    },
    select: {
      id: true
    }
  });

  if (!nextLevel) {
    return res.apiError(409, "Next level not found; cannot skip levels", "NEXT_LEVEL_NOT_FOUND");
  }

  const result = await assignLevelWithIntegrity({
    tenantId: req.auth.tenantId,
    studentId: id,
    targetLevelId: nextLevel.id,
    actorUserId: req.auth.userId,
    reason: "PROMOTION_CONFIRMED"
  });

  await syncStudentFeeDefaults({
    tx: prisma,
    tenantId: req.auth.tenantId,
    studentId: id,
    levelId: nextLevel.id,
    feeConcessionAmount: Number(student.feeConcessionAmount || 0)
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "PROMOTION_CONFIRMED",
    entityType: "STUDENT",
    entityId: id,
    metadata: {
      previousLevelId: result.previousLevelId,
      newLevelId: result.newLevelId,
      score: result.score,
      threshold: result.threshold
    }
  });

  void (async () => {
    try {
      const studentRecipients = await prisma.authUser.findMany({
        where: {
          tenantId: req.auth.tenantId,
          isActive: true,
          OR: [
            { studentId: id },
            {
              role: "TEACHER",
              hierarchyNodeId: (
                await prisma.student.findFirst({
                  where: { id, tenantId: req.auth.tenantId },
                  select: { hierarchyNodeId: true }
                })
              )?.hierarchyNodeId
            }
          ]
        },
        select: {
          id: true
        }
      });

      await createBulkNotification(
        studentRecipients.map((recipient) => ({
          tenantId: req.auth.tenantId,
          recipientUserId: recipient.id,
          type: "PROMOTION_CONFIRMED",
          title: "Promotion Confirmed",
          message: `Student ${id} promoted to next level`,
          entityType: "STUDENT",
          entityId: id
        }))
      );
    } catch {
      return;
    }
  })();

  return res.apiSuccess("Promotion confirmed", {
    success: true,
    previousLevelId: result.previousLevelId,
    newLevelId: result.newLevelId,
    promotedAt: new Date().toISOString(),
    score: result.score,
    threshold: result.threshold
  });
});

/**
 * Bulk CSV import of students.
 * Expected CSV columns: firstName, lastName, gender, dateOfBirth, guardianName, guardianPhone, guardianEmail, email, address
 * All rows share the request user's center (hierarchyNodeId) and lowest-rank level.
 */
const bulkImportStudentsCsv = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  if (!req.file || !req.file.buffer) {
    return res.apiError(400, "No CSV file uploaded", "FILE_REQUIRED");
  }

  const parsedRows = parseImportCsvRows(req.file.buffer);

  if (!Array.isArray(parsedRows) || !parsedRows.length) {
    return res.apiError(400, "CSV must have a header row and at least one data row", "CSV_EMPTY");
  }

  if (parsedRows.length > 500) {
    return res.apiError(400, "Maximum 500 students per import", "CSV_TOO_LARGE");
  }

  const hierarchyNodeId = req.auth.role === "SUPERADMIN"
    ? String(req.body.hierarchyNodeId || "")
    : String(req.auth.hierarchyNodeId || "");
  if (!hierarchyNodeId) {
    return res.apiError(400, "hierarchyNodeId is required", "HIERARCHY_NODE_REQUIRED");
  }

  const defaultLevel = await prisma.level.findFirst({
    where: { tenantId: req.auth.tenantId },
    orderBy: { rank: "asc" },
    select: { id: true, rank: true, name: true }
  });
  if (!defaultLevel) {
    return res.apiError(400, "No levels configured for tenant", "LEVELS_MISSING");
  }

  const defaultLevelId = String(req.body.levelId || "") || defaultLevel.id;
  const defaultBatchId = String(req.body.batchId || "").trim();
  const defaultTeacherUserId = String(req.body.assignedTeacherUserId || "").trim();
  const defaultStartDate = String(req.body.startDate || "").trim();

  const results = { created: 0, errors: [] };

  for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx += 1) {
    const rawRow = parsedRows[rowIdx] || {};
    const row = Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => [normalizeCsvHeaderKey(key), value])
    );

    const firstName = getCsvField(row, ["firstName", "first_name", "name"]);
    const lastName = getCsvField(row, ["lastName", "last_name"]);

    if (!firstName) {
      results.errors.push({ row: rowIdx + 2, error: "firstName is required" });
      continue;
    }

    const normalizedGender = getCsvField(row, ["gender"]) ? getCsvField(row, ["gender"]).toUpperCase() : null;
    if (normalizedGender && !["MALE", "FEMALE", "OTHER"].includes(normalizedGender)) {
      results.errors.push({ row: rowIdx + 2, error: `Invalid gender: ${getCsvField(row, ["gender"])}` });
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.$transaction(async (tx) => {
        const rowLevelId = await resolveImportLevelId({
          tx,
          tenantId: req.auth.tenantId,
          requestedLevelId: getCsvField(row, ["levelId"]),
          requestedLevelRank: getCsvField(row, ["levelRank"]),
          requestedLevelName: getCsvField(row, ["levelName", "level"]),
          fallbackLevelId: defaultLevelId
        });

        const rowBatch = await resolveImportBatch({
          tx,
          tenantId: req.auth.tenantId,
          hierarchyNodeId,
          requestedBatchId: getCsvField(row, ["batchId"]),
          requestedBatchName: getCsvField(row, ["batchName", "batch"]),
          fallbackBatchId: defaultBatchId
        });

        const assignedTeacherUserId = await resolveImportTeacherId({
          tx,
          tenantId: req.auth.tenantId,
          hierarchyNodeId,
          requestedTeacherUserId: getCsvField(row, ["assignedTeacherUserId", "teacherUserId"]),
          requestedTeacherUsername: getCsvField(row, ["teacherCode", "teacherUsername", "teacherusername"]),
          requestedTeacherEmail: getCsvField(row, ["teacherEmail", "teacheremail"]),
          fallbackTeacherUserId: defaultTeacherUserId
        });

        const admissionNoInput = normalizeAdmissionNo(getCsvField(row, ["admissionNo", "studentCode", "studentcode"]));
        const admissionNo = admissionNoInput || await generateNextStudentCode({ tx, tenantId: req.auth.tenantId, prefix: "ST" });
        const totalFeeAmount = normalizeImportMoney(getCsvField(row, ["totalFeeAmount", "totalfeeamount"]), "totalFeeAmount");
        const admissionFeeAmount = normalizeImportMoney(getCsvField(row, ["admissionFeeAmount", "admissionfeeamount"]), "admissionFeeAmount");
        const feeConcessionAmount = normalizeImportConcession(getCsvField(row, ["feeConcessionAmount", "feeconcessionamount"]));
        const levelDefaults = await getLevelFeeDefaults({ tx, tenantId: req.auth.tenantId, levelId: rowLevelId });
        const computedFeeDefaults = buildStudentFeeAmounts(levelDefaults, feeConcessionAmount);
        const studentFeeData = {
          totalFeeAmount: totalFeeAmount !== undefined ? totalFeeAmount : computedFeeDefaults.totalFeeAmount,
          admissionFeeAmount: admissionFeeAmount !== undefined ? admissionFeeAmount : computedFeeDefaults.admissionFeeAmount,
          feeConcessionAmount: computedFeeDefaults.feeConcessionAmount
        };

        const createdStudent = await tx.student.create({
          data: {
            tenantId: req.auth.tenantId,
            admissionNo,
            firstName,
            lastName: lastName || null,
            gender: normalizedGender || null,
            dateOfBirth: parseOptionalCsvDate(getCsvField(row, ["dateOfBirth", "date_of_birth", "dob"]), "dateOfBirth"),
            guardianName: getCsvField(row, ["guardianName", "guardian_name"]) || null,
            guardianPhone: getCsvField(row, ["guardianPhone", "guardian_phone"]) || null,
            guardianEmail: getCsvField(row, ["guardianEmail", "guardian_email"]) || null,
            email: getCsvField(row, ["email", "studentEmail", "student_email"]) || null,
            phonePrimary: getCsvField(row, ["phonePrimary", "phone_primary"]) || getCsvField(row, ["guardianPhone", "guardian_phone"]) || null,
            phoneSecondary: getCsvField(row, ["phoneSecondary", "phone_secondary"]) || null,
            address: getCsvField(row, ["address"]) || null,
            state: getCsvField(row, ["state"]) || null,
            district: getCsvField(row, ["district"]) || null,
            tehsil: getCsvField(row, ["tehsil"]) || null,
            hierarchyNodeId,
            levelId: rowLevelId,
            currentTeacherUserId: assignedTeacherUserId,
            isActive: normalizeBooleanFlag(getCsvField(row, ["isActive", "status"]), true),
            ...studentFeeData
          }
        });

        const enrollmentStartDate = parseOptionalCsvDate(
          getCsvField(row, ["startDate", "start_date"]) || defaultStartDate,
          "startDate"
        );

        await tx.enrollment.create({
          data: {
            tenantId: req.auth.tenantId,
            hierarchyNodeId: rowBatch.hierarchyNodeId,
            studentId: createdStudent.id,
            batchId: rowBatch.id,
            assignedTeacherUserId,
            levelId: rowLevelId,
            startDate: enrollmentStartDate,
            status: "ACTIVE"
          }
        });
      });

      results.created += 1;
    } catch (e) {
      const msg = e?.message || "Unknown error";
      results.errors.push({ row: rowIdx + 2, error: msg.slice(0, 200) });
    }
  }

  return res.apiSuccess("CSV import completed", {
    totalRows: parsedRows.length,
    created: results.created,
    errorCount: results.errors.length,
    errors: results.errors.slice(0, 50)
  });
});

const assignCourseToStudent = asyncHandler(async (req, res) => {
  assertCanModifyOperational(req.auth.role);

  const { id } = req.params;
  const { courseId, courseIds } = req.body || {};

  const rawIds = Array.isArray(courseIds)
    ? courseIds
    : (courseId ? [courseId] : []);
  const normalizedCourseIds = [...new Set(rawIds
    .map((value) => String(value || "").trim())
    .filter(Boolean))];

  const student = await prisma.student.findFirst({
    where: { id, tenantId: req.auth.tenantId },
    select: {
      id: true,
      courseId: true,
      hierarchyNodeId: true,
      assignedCourses: {
        select: { courseId: true }
      }
    }
  });

  if (!student) {
    return res.apiError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (normalizedCourseIds.length > 0) {
    const courses = await prisma.course.findMany({
      where: {
        tenantId: req.auth.tenantId,
        id: { in: normalizedCourseIds },
        isActive: true
      },
      select: { id: true }
    });

    if (courses.length !== normalizedCourseIds.length) {
      return res.apiError(404, "One or more courses not found or inactive", "COURSE_NOT_FOUND");
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.studentAssignedCourse.deleteMany({
      where: {
        tenantId: req.auth.tenantId,
        studentId: id
      }
    });

    if (normalizedCourseIds.length > 0) {
      await tx.studentAssignedCourse.createMany({
        data: normalizedCourseIds.map((nextCourseId) => ({
          tenantId: req.auth.tenantId,
          studentId: id,
          courseId: nextCourseId
        }))
      });
    }

    return tx.student.update({
      where: { id },
      data: { courseId: normalizedCourseIds[0] || null },
      include: {
        level: { select: { id: true, name: true, rank: true } },
        course: { select: { id: true, code: true, name: true } },
        assignedCourses: {
          select: {
            id: true,
            courseId: true,
            course: { select: { id: true, code: true, name: true } }
          }
        }
      }
    });
  });

  await recordAudit({
    tenantId: req.auth.tenantId,
    userId: req.auth.userId,
    role: req.auth.role,
    action: "ASSIGN_COURSE",
    entityType: "STUDENT",
    entityId: id,
    metadata: {
      assignedCourseIds: normalizedCourseIds,
      assignedCourseId: normalizedCourseIds[0] || null,
      previousCourseId: student.courseId,
      previousCourseIds: Array.isArray(student.assignedCourses)
        ? student.assignedCourses.map((row) => row.courseId)
        : []
    }
  });

  return res.apiSuccess("Courses assigned to student", updated);
});

export {
  listStudents,
  getStudent,
  exportStudentsCsv,
  exportStudentsExcel,
  getNextStudentCode,
  listStudentNotes,
  createStudentNote,
  updateStudentNote,
  deleteStudentNote,
  exportStudentNotesCsv,
  createStudent,
  updateStudent,
  getStudentFeesContext,
  upsertStudentInstallment,
  deleteStudentInstallment,
  createStudentFeePayment,
  createStudentLogin,
  resetStudentPassword,
  assignLevelToStudent,
  assignCourseToStudent,
  getPromotionStatus,
  getPerformanceSummary,
  confirmPromotion,
  uploadStudentPhoto,
  bulkImportStudentsCsv
};
