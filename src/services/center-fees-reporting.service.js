import { prisma } from "../lib/prisma.js";
import { computeFeeTimelinesForStudents } from "./student-fee-due.service.js";

const PAYMENT_TYPES = ["ENROLLMENT", "RENEWAL"];

function toSafeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Number(toSafeNumber(value).toFixed(2));
}

function formatStudentName(row) {
  const firstName = row?.firstName ? String(row.firstName).trim() : "";
  const lastName = row?.lastName ? String(row.lastName).trim() : "";
  return `${firstName} ${lastName}`.trim();
}

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function compareDatesAsc(a, b) {
  const left = toDate(a);
  const right = toDate(b);
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.getTime() - right.getTime();
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function buildStudentWhere({ tenantId, centerId, filters = {} }) {
  const where = {
    tenantId,
    hierarchyNodeId: centerId,
    isActive: true
  };

  if (filters?.levelId) {
    where.levelId = String(filters.levelId);
  }

  const search = String(filters?.search || "").trim();
  if (search) {
    where.OR = [
      { firstName: { contains: search } },
      { lastName: { contains: search } },
      { admissionNo: { contains: search } }
    ];
  }

  if (filters?.batchId) {
    where.batchEnrollments = {
      some: {
        tenantId,
        hierarchyNodeId: centerId,
        batchId: String(filters.batchId),
        status: "ACTIVE"
      }
    };
  }

  return where;
}

async function computeTimelinesByStudentChunked({ tenantId, studentIds, asOf = new Date() }) {
  const idList = Array.from(new Set((studentIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const result = new Map();
  if (!idList.length) return result;

  const chunks = chunkArray(idList, 200);
  for (const chunk of chunks) {
    const partial = await computeFeeTimelinesForStudents({
      tenantId,
      studentIds: chunk,
      asOf
    });

    for (const [studentId, timeline] of partial.entries()) {
      result.set(String(studentId), timeline);
    }
  }

  return result;
}

function pickTeacherName(batch) {
  if (!batch) return null;
  const profileName = batch.primaryTeacher?.teacherProfile?.fullName;
  if (profileName) return String(profileName);
  return batch.primaryTeacher?.username || batch.primaryTeacher?.email || null;
}

async function getActiveEnrollmentMeta({ tenantId, centerId, studentIds }) {
  const ids = (studentIds || []).map((id) => String(id));
  const byStudent = new Map();
  if (!ids.length) return byStudent;

  const rows = await prisma.enrollment.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      status: "ACTIVE",
      studentId: { in: ids }
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      studentId: true,
      batch: {
        select: {
          name: true,
          primaryTeacher: {
            select: {
              username: true,
              email: true,
              teacherProfile: {
                select: {
                  fullName: true
                }
              }
            }
          }
        }
      }
    }
  });

  for (const row of rows) {
    const studentId = String(row.studentId);
    if (byStudent.has(studentId)) continue;

    byStudent.set(studentId, {
      batchName: row.batch?.name ? String(row.batch.name) : null,
      teacherName: pickTeacherName(row.batch)
    });
  }

  return byStudent;
}

async function getLastPaymentDateByStudent({ tenantId, centerId, studentIds }) {
  const ids = (studentIds || []).map((id) => String(id));
  const map = new Map();
  if (!ids.length) return map;

  const rows = await prisma.financialTransaction.findMany({
    where: {
      tenantId,
      centerId,
      studentId: { in: ids },
      type: { in: PAYMENT_TYPES }
    },
    orderBy: [{ studentId: "asc" }, { receivedAt: "desc" }, { createdAt: "desc" }],
    select: {
      studentId: true,
      receivedAt: true,
      createdAt: true
    }
  });

  for (const row of rows) {
    const studentId = String(row.studentId);
    if (map.has(studentId)) continue;
    map.set(studentId, toDate(row.receivedAt) || toDate(row.createdAt));
  }

  return map;
}

async function getPaidInRangeByStudent({ tenantId, centerId, studentIds, from, toExclusive }) {
  const ids = (studentIds || []).map((id) => String(id));
  const map = new Map();
  if (!ids.length) return map;

  const rows = await prisma.financialTransaction.groupBy({
    by: ["studentId"],
    where: {
      tenantId,
      centerId,
      studentId: { in: ids },
      type: { in: PAYMENT_TYPES },
      createdAt: {
        gte: from,
        lt: toExclusive
      }
    },
    _sum: {
      grossAmount: true
    }
  });

  for (const row of rows) {
    map.set(String(row.studentId), round2(row._sum?.grossAmount));
  }

  return map;
}

async function listPendingInstallments({ tenantId, centerId, range, limit, offset, filters = {} }) {
  const where = buildStudentWhere({ tenantId, centerId, filters });

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ admissionNo: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      phonePrimary: true,
      guardianPhone: true
    }
  });

  const studentIds = students.map((row) => String(row.id));

  const [timelinesByStudent, enrollmentMetaByStudent, lastPaymentByStudent] = await Promise.all([
    computeTimelinesByStudentChunked({ tenantId, studentIds, asOf: new Date() }),
    getActiveEnrollmentMeta({ tenantId, centerId, studentIds }),
    getLastPaymentDateByStudent({ tenantId, centerId, studentIds })
  ]);

  const requestedStatuses = String(filters?.status || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => ["PENDING", "OVERDUE"].includes(value));

  const materialized = [];

  for (const student of students) {
    const studentId = String(student.id);
    const timeline = timelinesByStudent.get(studentId) || { dues: [], summary: {} };

    const pendingRows = (timeline.dues || []).filter((row) => round2(row.pending) > 0);
    if (!pendingRows.length) continue;

    const overdueRows = pendingRows.filter((row) => String(row.status || "").toUpperCase() === "OVERDUE");
    const overdueCount = overdueRows.length;
    const status = overdueCount > 0 ? "OVERDUE" : "PENDING";

    if (requestedStatuses.length && !requestedStatuses.includes(status)) {
      continue;
    }

    const pendingAmount = round2(
      pendingRows.reduce((sum, row) => sum + round2(row.pending), 0)
    );

    let nextDueDate = null;
    for (const row of pendingRows) {
      const dueDate = toDate(row.dueDate);
      if (!dueDate) continue;
      if (!nextDueDate || dueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = dueDate;
      }
    }

    const enrollmentMeta = enrollmentMetaByStudent.get(studentId) || {};

    materialized.push({
      id: studentId,
      studentId,
      dueDate: nextDueDate,
      amount: pendingAmount,
      paidAmount: 0,
      pending: pendingAmount,
      pendingAmount,
      status,
      overdueCount,
      lastPaymentDate: lastPaymentByStudent.get(studentId) || null,
      student: {
        id: studentId,
        studentCode: student.admissionNo ? String(student.admissionNo) : null,
        admissionNo: student.admissionNo ? String(student.admissionNo) : null,
        firstName: student.firstName ? String(student.firstName) : null,
        lastName: student.lastName ? String(student.lastName) : null,
        contactNumber: student.phonePrimary ? String(student.phonePrimary) : null,
        parentContactNumber: student.guardianPhone ? String(student.guardianPhone) : null,
        batch: enrollmentMeta.batchName ? { name: enrollmentMeta.batchName } : null,
        teacher: enrollmentMeta.teacherName ? { name: enrollmentMeta.teacherName } : null
      }
    });
  }

  materialized.sort((a, b) => {
    if (b.overdueCount !== a.overdueCount) {
      return b.overdueCount - a.overdueCount;
    }

    const byDueDate = compareDatesAsc(a.dueDate, b.dueDate);
    if (byDueDate !== 0) {
      return byDueDate;
    }

    if (b.pendingAmount !== a.pendingAmount) {
      return b.pendingAmount - a.pendingAmount;
    }

    return String(a.student?.admissionNo || "").localeCompare(String(b.student?.admissionNo || ""));
  });

  const total = materialized.length;
  const items = materialized.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

async function listStudentWise({ tenantId, centerId, range, limit, offset, filters = {} }) {
  const where = buildStudentWhere({ tenantId, centerId, filters });

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ admissionNo: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      totalFeeAmount: true
    }
  });

  const studentIds = students.map((row) => String(row.id));

  const [timelinesByStudent, paidInRangeByStudent] = await Promise.all([
    computeTimelinesByStudentChunked({ tenantId, studentIds, asOf: new Date() }),
    getPaidInRangeByStudent({
      tenantId,
      centerId,
      studentIds,
      from: range.from,
      toExclusive: range.toExclusive
    })
  ]);

  const materialized = [];

  for (const student of students) {
    const studentId = String(student.id);
    const timeline = timelinesByStudent.get(studentId) || { dues: [], summary: {} };

    const paidInRange = round2(paidInRangeByStudent.get(studentId) || 0);
    const duePending = round2(timeline.summary?.totalPending || 0);
    const overduePending = round2(timeline.summary?.totalOverdue || 0);
    const overdueCount = (timeline.dues || []).filter(
      (row) => String(row.status || "").toUpperCase() === "OVERDUE" && round2(row.pending) > 0
    ).length;

    if (paidInRange <= 0 && duePending <= 0) {
      continue;
    }

    materialized.push({
      id: studentId,
      studentId,
      admissionNo: student.admissionNo ? String(student.admissionNo) : null,
      firstName: student.firstName ? String(student.firstName) : null,
      lastName: student.lastName ? String(student.lastName) : null,
      studentName: formatStudentName(student) || null,
      totalFeeAmount: student.totalFeeAmount == null ? null : round2(student.totalFeeAmount),
      paidInRange,
      duePending,
      overduePending,
      overdueCount
    });
  }

  materialized.sort((a, b) => {
    if (b.overduePending !== a.overduePending) {
      return b.overduePending - a.overduePending;
    }

    if (b.duePending !== a.duePending) {
      return b.duePending - a.duePending;
    }

    if (b.paidInRange !== a.paidInRange) {
      return b.paidInRange - a.paidInRange;
    }

    return String(a.admissionNo || "").localeCompare(String(b.admissionNo || ""));
  });

  const total = materialized.length;
  const items = materialized.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

async function getMonthlyDues({ tenantId, centerId, range }) {
  const students = await prisma.student.findMany({
    where: {
      tenantId,
      hierarchyNodeId: centerId,
      isActive: true
    },
    select: {
      id: true
    }
  });

  const studentIds = students.map((row) => String(row.id));

  const now = new Date();
  const asOf = range.toExclusive.getTime() > now.getTime()
    ? new Date(range.toExclusive.getTime() - 1)
    : now;

  const timelinesByStudent = await computeTimelinesByStudentChunked({ tenantId, studentIds, asOf });

  const monthly = new Map();

  for (const timeline of timelinesByStudent.values()) {
    for (const due of timeline.dues || []) {
      const dueDate = toDate(due.dueDate);
      if (!dueDate) continue;
      if (dueDate.getTime() < range.from.getTime() || dueDate.getTime() >= range.toExclusive.getTime()) {
        continue;
      }

      const year = Number(due.year || dueDate.getUTCFullYear());
      const month = Number(due.month || (dueDate.getUTCMonth() + 1));
      const key = `${year}-${String(month).padStart(2, "0")}`;

      if (!monthly.has(key)) {
        monthly.set(key, {
          year,
          month,
          installmentAmount: 0,
          paidAmount: 0,
          pendingAmount: 0,
          overduePendingAmount: 0
        });
      }

      const entry = monthly.get(key);
      const amount = round2(due.amount);
      const paid = round2(due.paid);
      const pending = round2(due.pending);

      entry.installmentAmount = round2(entry.installmentAmount + amount);
      entry.paidAmount = round2(entry.paidAmount + paid);
      entry.pendingAmount = round2(entry.pendingAmount + pending);
      if (String(due.status || "").toUpperCase() === "OVERDUE") {
        entry.overduePendingAmount = round2(entry.overduePendingAmount + pending);
      }
    }
  }

  const items = [...monthly.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });

  return { items };
}

function resolveReminderStatus(summary = {}) {
  const totalPending = round2(summary.totalPending || 0);
  const totalOverdue = round2(summary.totalOverdue || 0);
  const totalPaid = round2(summary.totalPaid || 0);

  if (totalPending <= 0 && totalPaid > 0) return "PAID";
  if (totalOverdue > 0) return "OVERDUE";
  if (totalPending > 0) return "PENDING";
  return "NO_DATA";
}

async function listReminders({ tenantId, centerId, range, limit, offset, filters = {} }) {
  const where = buildStudentWhere({ tenantId, centerId, filters });

  const students = await prisma.student.findMany({
    where,
    orderBy: [{ admissionNo: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      admissionNo: true,
      firstName: true,
      lastName: true,
      phonePrimary: true,
      guardianPhone: true
    }
  });

  const studentIds = students.map((row) => String(row.id));

  const now = new Date();
  const asOf = range.toExclusive.getTime() > now.getTime()
    ? new Date(range.toExclusive.getTime() - 1)
    : now;

  const [timelinesByStudent, enrollmentMetaByStudent, lastPaymentByStudent] = await Promise.all([
    computeTimelinesByStudentChunked({ tenantId, studentIds, asOf }),
    getActiveEnrollmentMeta({ tenantId, centerId, studentIds }),
    getLastPaymentDateByStudent({ tenantId, centerId, studentIds })
  ]);

  const requestedStatuses = String(filters?.status || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => ["PAID", "PENDING", "OVERDUE"].includes(value));

  const materialized = [];

  for (const student of students) {
    const studentId = String(student.id);
    const timeline = timelinesByStudent.get(studentId) || { dues: [], summary: {} };
    const status = resolveReminderStatus(timeline.summary || {});

    if (requestedStatuses.length && !requestedStatuses.includes(status)) {
      continue;
    }

    const pendingAmount = round2(timeline.summary?.totalPending || 0);
    const overdueAmount = round2(timeline.summary?.totalOverdue || 0);
    const overdueCount = (timeline.dues || []).filter(
      (row) => String(row.status || "").toUpperCase() === "OVERDUE" && round2(row.pending) > 0
    ).length;

    const relevantRows = (timeline.dues || []).filter((row) => {
      const dueDate = toDate(row.dueDate);
      if (!dueDate) return false;
      if (dueDate.getTime() < range.from.getTime() || dueDate.getTime() >= range.toExclusive.getTime()) return false;
      return round2(row.pending) > 0;
    });

    let nextDueDate = null;
    for (const row of (timeline.dues || []).filter((due) => round2(due.pending) > 0)) {
      const dueDate = toDate(row.dueDate);
      if (!dueDate) continue;
      if (!nextDueDate || dueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = dueDate;
      }
    }

    if (!nextDueDate && status !== "PAID") {
      continue;
    }

    const enrollmentMeta = enrollmentMetaByStudent.get(studentId) || {};

    materialized.push({
      studentId,
      admissionNo: student.admissionNo ? String(student.admissionNo) : null,
      studentName: formatStudentName(student) || null,
      pendingAmount,
      overdueAmount,
      overdueCount,
      nextDueDate,
      status,
      lastPaymentDate: lastPaymentByStudent.get(studentId) || null,
      student: {
        id: studentId,
        studentCode: student.admissionNo ? String(student.admissionNo) : null,
        admissionNo: student.admissionNo ? String(student.admissionNo) : null,
        firstName: student.firstName ? String(student.firstName) : null,
        lastName: student.lastName ? String(student.lastName) : null,
        contactNumber: student.phonePrimary ? String(student.phonePrimary) : null,
        parentContactNumber: student.guardianPhone ? String(student.guardianPhone) : null,
        batch: enrollmentMeta.batchName ? { name: enrollmentMeta.batchName } : null,
        teacher: enrollmentMeta.teacherName ? { name: enrollmentMeta.teacherName } : null
      }
    });
  }

  materialized.sort((a, b) => {
    const statusRank = { OVERDUE: 3, PENDING: 2, PAID: 1, NO_DATA: 0 };
    const rankDiff = (statusRank[b.status] || 0) - (statusRank[a.status] || 0);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    if (b.overdueAmount !== a.overdueAmount) {
      return b.overdueAmount - a.overdueAmount;
    }

    if (b.pendingAmount !== a.pendingAmount) {
      return b.pendingAmount - a.pendingAmount;
    }

    return String(a.admissionNo || "").localeCompare(String(b.admissionNo || ""));
  });

  const total = materialized.length;
  const items = materialized.slice(offset, offset + limit);

  return { items, total, limit, offset };
}

export { listPendingInstallments, listStudentWise, getMonthlyDues, listReminders };
