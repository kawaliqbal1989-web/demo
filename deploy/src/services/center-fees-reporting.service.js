import { prisma } from "../lib/prisma.js";

const PAYMENT_TYPES = ["ENROLLMENT", "RENEWAL"];

function toSafeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatStudentName(row) {
  const firstName = row?.firstName ? String(row.firstName).trim() : "";
  const lastName = row?.lastName ? String(row.lastName).trim() : "";
  return `${firstName} ${lastName}`.trim();
}

async function listPendingInstallments({ tenantId, centerId, range, limit, offset, filters = {} }) {
  const { status, levelId, batchId, search } = filters;

  // Build additional WHERE conditions
  let additionalWhere = "";
  
  if (batchId) {
    additionalWhere += ` AND EXISTS (
      SELECT 1 FROM Enrollment e2
      WHERE e2.studentId = s.id
      AND e2.batchId = '${batchId.replace(/'/g, "''")}'
      AND e2.status = 'ACTIVE'
    )`;
  }
  
  if (levelId) {
    additionalWhere += ` AND s.currentLevelId = '${levelId.replace(/'/g, "''")}'`;
  }
  
  if (search) {
    const escapedSearch = search.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    additionalWhere += ` AND (
      s.firstName LIKE '%${escapedSearch}%' OR
      s.lastName LIKE '%${escapedSearch}%' OR
      s.admissionNo LIKE '%${escapedSearch}%'
    )`;
  }

  const allowedStatuses = new Set(["PENDING", "OVERDUE"]);
  const requestedStatuses = String(status || "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => allowedStatuses.has(value));

  let statusWhere = "";
  if (requestedStatuses.length > 0) {
    statusWhere = ` AND (CASE WHEN due.overdueCount > 0 THEN 'OVERDUE' ELSE 'PENDING' END) IN (${requestedStatuses
      .map((value) => `'${value}'`)
      .join(",")})`;
  }

  const countSql = `
    SELECT COUNT(1) AS total
    FROM (
      SELECT s.id
      FROM Student s
      JOIN (
        SELECT
          i.studentId,
          SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS pendingAmount,
          MIN(CASE WHEN GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) > 0 THEN i.dueDate ELSE NULL END) AS nextDueDate,
          SUM(CASE WHEN i.dueDate < NOW() AND GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) > 0 THEN 1 ELSE 0 END) AS overdueCount
        FROM StudentFeeInstallment i
        LEFT JOIN (
          SELECT installmentId, SUM(grossAmount) AS paidAmount
          FROM FinancialTransaction
          WHERE tenantId = ?
            AND centerId = ?
            AND installmentId IS NOT NULL
            AND type IN (?, ?)
          GROUP BY installmentId
        ) p ON p.installmentId = i.id
        WHERE i.tenantId = ?
        GROUP BY i.studentId
        HAVING pendingAmount > 0
      ) due ON due.studentId = s.id
      WHERE s.tenantId = ?
        AND s.hierarchyNodeId = ?
        AND s.isActive = 1
        ${additionalWhere}
        ${statusWhere}
    ) x
  `;

  const totalRows = await prisma.$queryRawUnsafe(
    countSql,
    tenantId,
    centerId,
    PAYMENT_TYPES[0],
    PAYMENT_TYPES[1],
    tenantId,
    tenantId,
    centerId
  );

  const total = toSafeNumber(Array.isArray(totalRows) ? totalRows[0]?.total : 0);

  const dataSql = `
    SELECT
      s.id AS studentId,
      due.pendingAmount,
      due.nextDueDate,
      due.overdueCount,
      s.admissionNo,
      s.firstName,
      s.lastName,
      s.phonePrimary,
      s.guardianPhone,
      (SELECT MAX(t2.receivedAt) FROM FinancialTransaction t2
       WHERE t2.tenantId = ?
         AND t2.centerId = ?
         AND t2.studentId = s.id
         AND t2.type IN (?, ?)) AS lastPaymentDate,
      (SELECT b2.name FROM Enrollment e2 
       LEFT JOIN Batch b2 ON b2.id = e2.batchId 
       WHERE e2.studentId = s.id AND e2.status = 'ACTIVE' 
       LIMIT 1) AS batchName,
      (SELECT tp2.fullName FROM Enrollment e3
       LEFT JOIN Batch b3 ON b3.id = e3.batchId
       LEFT JOIN TeacherProfile tp2 ON tp2.authUserId = b3.primaryTeacherUserId
       WHERE e3.studentId = s.id AND e3.status = 'ACTIVE'
       LIMIT 1) AS teacherName
    FROM Student s
    JOIN (
      SELECT
        i.studentId,
        SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS pendingAmount,
        MIN(CASE WHEN GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) > 0 THEN i.dueDate ELSE NULL END) AS nextDueDate,
        SUM(CASE WHEN i.dueDate < NOW() AND GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) > 0 THEN 1 ELSE 0 END) AS overdueCount
      FROM StudentFeeInstallment i
      LEFT JOIN (
        SELECT installmentId, SUM(grossAmount) AS paidAmount
        FROM FinancialTransaction
        WHERE tenantId = ?
          AND centerId = ?
          AND installmentId IS NOT NULL
          AND type IN (?, ?)
        GROUP BY installmentId
      ) p ON p.installmentId = i.id
      WHERE i.tenantId = ?
      GROUP BY i.studentId
      HAVING pendingAmount > 0
    ) due ON due.studentId = s.id
    WHERE s.tenantId = ?
      AND s.hierarchyNodeId = ?
      AND s.isActive = 1
      ${additionalWhere}
      ${statusWhere}
    ORDER BY due.overdueCount DESC, due.nextDueDate ASC, due.pendingAmount DESC, s.admissionNo ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await prisma.$queryRawUnsafe(
    dataSql,
    tenantId,
    centerId,
    PAYMENT_TYPES[0],
    PAYMENT_TYPES[1],
    tenantId,
    centerId,
    PAYMENT_TYPES[0],
    PAYMENT_TYPES[1],
    tenantId,
    tenantId,
    centerId,
    limit,
    offset
  );

  const now = new Date();

  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const pending = toSafeNumber(row.pendingAmount);
    const amount = pending;
    const paidAmount = 0;

    let status = "PENDING";

    const dueDate = row.nextDueDate instanceof Date ? row.nextDueDate : row.nextDueDate ? new Date(row.nextDueDate) : null;
    if (dueDate && dueDate.getTime() < now.getTime()) {
      status = "OVERDUE";
    }

    const lastPaymentDate = row.lastPaymentDate instanceof Date ? row.lastPaymentDate : row.lastPaymentDate ? new Date(row.lastPaymentDate) : null;

    return {
      id: String(row.studentId),
      studentId: String(row.studentId),
      dueDate,
      amount,
      paidAmount,
      pending,
      pendingAmount: pending,
      status,
      lastPaymentDate,
      student: {
        id: String(row.studentId),
        studentCode: row.admissionNo ? String(row.admissionNo) : null,
        admissionNo: row.admissionNo ? String(row.admissionNo) : null,
        firstName: row.firstName ? String(row.firstName) : null,
        lastName: row.lastName ? String(row.lastName) : null,
        contactNumber: row.phonePrimary ? String(row.phonePrimary) : null,
        parentContactNumber: row.guardianPhone ? String(row.guardianPhone) : null,
        batch: row.batchName ? { name: String(row.batchName) } : null,
        teacher: row.teacherName ? { name: String(row.teacherName) } : null
      }
    };
  });

  return { items, total, limit, offset };
}

async function listStudentWise({ tenantId, centerId, range, limit, offset, filters = {} }) {
  const from = range.from;
  const toExclusive = range.toExclusive;
  const { batchId, levelId, search } = filters;

  // Build additional WHERE conditions using Prisma's Sql helper
  const studentFilterConditions = [];
  
  if (batchId) {
    studentFilterConditions.push(prisma.$queryRaw`EXISTS (
      SELECT 1 FROM BatchEnrollment be 
      WHERE be.studentId = s.id 
      AND be.batchId = ${batchId}
      AND be.status = 'ACTIVE'
    )`);
  }
  
  if (levelId) {
    studentFilterConditions.push(prisma.$queryRaw`s.currentLevelId = ${levelId}`);
  }
  
  if (search) {
    const searchPattern = `%${search}%`;
    studentFilterConditions.push(prisma.$queryRaw`(
      s.firstName LIKE ${searchPattern} OR 
      s.lastName LIKE ${searchPattern} OR 
      s.admissionNo LIKE ${searchPattern}
    )`);
  }

  // For now, use a simpler approach - build complete WHERE as string
  let additionalWhere = "";
  if (batchId) {
    additionalWhere += ` AND EXISTS (
      SELECT 1 FROM BatchEnrollment be 
      WHERE be.studentId = s.id 
      AND be.batchId = '${batchId.replace(/'/g, "''")}'
      AND be.status = 'ACTIVE'
    )`;
  }
  if (levelId) {
    additionalWhere += ` AND s.currentLevelId = '${levelId.replace(/'/g, "''")}'`;
  }
  if (search) {
    const escapedSearch = search.replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_');
    additionalWhere += ` AND (
      s.firstName LIKE '%${escapedSearch}%' OR 
      s.lastName LIKE '%${escapedSearch}%' OR 
      s.admissionNo LIKE '%${escapedSearch}%'
    )`;
  }

  const countSql = `
    SELECT COUNT(1) AS total
    FROM (
      SELECT s.id
      FROM Student s
      LEFT JOIN (
        SELECT
          studentId,
          SUM(grossAmount) AS paidInRange
        FROM FinancialTransaction
        WHERE tenantId = ?
          AND centerId = ?
          AND studentId IS NOT NULL
          AND type IN (?, ?)
          AND createdAt >= ?
          AND createdAt < ?
        GROUP BY studentId
      ) paid ON paid.studentId = s.id
      LEFT JOIN (
        SELECT
          i.studentId,
          SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS duePending,
          SUM(CASE WHEN i.dueDate < NOW() THEN GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) ELSE 0 END) AS overduePending,
          SUM(CASE WHEN i.dueDate < NOW() AND (i.amount - COALESCE(p.paidAmount, 0)) > 0 THEN 1 ELSE 0 END) AS overdueCount
        FROM StudentFeeInstallment i
        JOIN Student s2 ON s2.id = i.studentId
        LEFT JOIN (
          SELECT installmentId, SUM(grossAmount) AS paidAmount
          FROM FinancialTransaction
          WHERE tenantId = ?
            AND centerId = ?
            AND installmentId IS NOT NULL
            AND type IN (?, ?)
          GROUP BY installmentId
        ) p ON p.installmentId = i.id
        WHERE i.tenantId = ?
          AND s2.tenantId = ?
          AND s2.hierarchyNodeId = ?
        GROUP BY i.studentId
      ) due ON due.studentId = s.id
      WHERE s.tenantId = ?
        AND s.hierarchyNodeId = ?
        AND s.isActive = 1
        ${additionalWhere}
        AND (COALESCE(paid.paidInRange, 0) > 0 OR COALESCE(due.duePending, 0) > 0)
    ) x
  `;

  const totalRows = await prisma.$queryRawUnsafe(
    countSql,
    tenantId, centerId, PAYMENT_TYPES[0], PAYMENT_TYPES[1], from, toExclusive,
    tenantId, centerId, PAYMENT_TYPES[0], PAYMENT_TYPES[1],
    tenantId, tenantId, centerId,
    tenantId, centerId
  );

  const total = toSafeNumber(Array.isArray(totalRows) ? totalRows[0]?.total : 0);

  const dataSql = `
    SELECT
      s.id,
      s.admissionNo,
      s.firstName,
      s.lastName,
      COALESCE(paid.paidInRange, 0) AS paidInRange,
      COALESCE(due.duePending, 0) AS duePending,
      COALESCE(due.overduePending, 0) AS overduePending,
      COALESCE(due.overdueCount, 0) AS overdueCount
    FROM Student s
    LEFT JOIN (
      SELECT
        studentId,
        SUM(grossAmount) AS paidInRange
      FROM FinancialTransaction
      WHERE tenantId = ?
        AND centerId = ?
        AND studentId IS NOT NULL
        AND type IN (?, ?)
        AND createdAt >= ?
        AND createdAt < ?
      GROUP BY studentId
    ) paid ON paid.studentId = s.id
    LEFT JOIN (
      SELECT
        i.studentId,
        SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS duePending,
        SUM(CASE WHEN i.dueDate < NOW() THEN GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) ELSE 0 END) AS overduePending,
        SUM(CASE WHEN i.dueDate < NOW() AND (i.amount - COALESCE(p.paidAmount, 0)) > 0 THEN 1 ELSE 0 END) AS overdueCount
      FROM StudentFeeInstallment i
      JOIN Student s2 ON s2.id = i.studentId
      LEFT JOIN (
        SELECT installmentId, SUM(grossAmount) AS paidAmount
        FROM FinancialTransaction
        WHERE tenantId = ?
          AND centerId = ?
          AND installmentId IS NOT NULL
          AND type IN (?, ?)
        GROUP BY installmentId
      ) p ON p.installmentId = i.id
      WHERE i.tenantId = ?
        AND s2.tenantId = ?
        AND s2.hierarchyNodeId = ?
      GROUP BY i.studentId
    ) due ON due.studentId = s.id
    WHERE s.tenantId = ?
      AND s.hierarchyNodeId = ?
      AND s.isActive = 1
      ${additionalWhere}
      AND (COALESCE(paid.paidInRange, 0) > 0 OR COALESCE(due.duePending, 0) > 0)
    ORDER BY COALESCE(due.overduePending, 0) DESC,
      COALESCE(due.duePending, 0) DESC,
      COALESCE(paid.paidInRange, 0) DESC,
      s.admissionNo ASC
    LIMIT ? OFFSET ?
  `;

  const rows = await prisma.$queryRawUnsafe(
    dataSql,
    tenantId, centerId, PAYMENT_TYPES[0], PAYMENT_TYPES[1], from, toExclusive,
    tenantId, centerId, PAYMENT_TYPES[0], PAYMENT_TYPES[1],
    tenantId, tenantId, centerId,
    tenantId, centerId,
    limit, offset
  );

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    id: String(row.id),
    studentId: String(row.id),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    firstName: row.firstName ? String(row.firstName) : null,
    lastName: row.lastName ? String(row.lastName) : null,
    studentName: formatStudentName(row) || null,
    paidInRange: toSafeNumber(row.paidInRange),
    duePending: toSafeNumber(row.duePending),
    overduePending: toSafeNumber(row.overduePending),
    overdueCount: toSafeNumber(row.overdueCount)
  }));

  return { items, total, limit, offset };
}

async function getMonthlyDues({ tenantId, centerId, range }) {
  const from = range.from;
  const toExclusive = range.toExclusive;

  const rows = await prisma.$queryRaw`
    SELECT
      x.year,
      x.month,
      SUM(x.amount) AS installmentAmount,
      SUM(x.paidAmount) AS paidAmount,
      SUM(x.pending) AS pendingAmount,
      SUM(x.overduePending) AS overduePendingAmount
    FROM (
      SELECT
        i.id,
        YEAR(i.dueDate) AS year,
        MONTH(i.dueDate) AS month,
        i.amount AS amount,
        COALESCE(SUM(t.grossAmount), 0) AS paidAmount,
        GREATEST(i.amount - COALESCE(SUM(t.grossAmount), 0), 0) AS pending,
        CASE WHEN i.dueDate < NOW()
          THEN GREATEST(i.amount - COALESCE(SUM(t.grossAmount), 0), 0)
          ELSE 0
        END AS overduePending
      FROM StudentFeeInstallment i
      JOIN Student s ON s.id = i.studentId
      LEFT JOIN FinancialTransaction t
        ON t.installmentId = i.id
        AND t.tenantId = i.tenantId
        AND t.centerId = ${centerId}
        AND t.type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]})
      WHERE i.tenantId = ${tenantId}
        AND s.tenantId = ${tenantId}
        AND s.hierarchyNodeId = ${centerId}
        AND i.dueDate >= ${from}
        AND i.dueDate < ${toExclusive}
      GROUP BY i.id
    ) x
    GROUP BY x.year, x.month
    ORDER BY x.year ASC, x.month ASC
  `;

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    year: toSafeNumber(row.year),
    month: toSafeNumber(row.month),
    installmentAmount: toSafeNumber(row.installmentAmount),
    paidAmount: toSafeNumber(row.paidAmount),
    pendingAmount: toSafeNumber(row.pendingAmount),
    overduePendingAmount: toSafeNumber(row.overduePendingAmount)
  }));

  return { items };
}

async function listReminders({ tenantId, centerId, range, limit, offset }) {
  const from = range.from;
  const toExclusive = range.toExclusive;

  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(1) AS total
    FROM (
      SELECT s.id
      FROM Student s
      JOIN (
        SELECT
          i.studentId,
          SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS pendingAmount
        FROM StudentFeeInstallment i
        JOIN Student s2 ON s2.id = i.studentId
        LEFT JOIN (
          SELECT installmentId, SUM(grossAmount) AS paidAmount
          FROM FinancialTransaction
          WHERE tenantId = ${tenantId}
            AND centerId = ${centerId}
            AND installmentId IS NOT NULL
            AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]})
          GROUP BY installmentId
        ) p ON p.installmentId = i.id
        WHERE i.tenantId = ${tenantId}
          AND s2.tenantId = ${tenantId}
          AND s2.hierarchyNodeId = ${centerId}
          AND i.dueDate >= ${from}
          AND i.dueDate < ${toExclusive}
        GROUP BY i.studentId
        HAVING pendingAmount > 0
      ) due ON due.studentId = s.id
      WHERE s.tenantId = ${tenantId}
        AND s.hierarchyNodeId = ${centerId}
        AND s.isActive = 1
    ) x
  `;

  const total = toSafeNumber(Array.isArray(totalRows) ? totalRows[0]?.total : 0);

  const rows = await prisma.$queryRaw`
    SELECT
      s.id,
      s.admissionNo,
      s.firstName,
      s.lastName,
      due.pendingAmount,
      due.overdueAmount,
      due.overdueCount,
      due.nextDueDate
    FROM Student s
    JOIN (
      SELECT
        i.studentId,
        SUM(GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0)) AS pendingAmount,
        SUM(CASE WHEN i.dueDate < NOW() THEN GREATEST(i.amount - COALESCE(p.paidAmount, 0), 0) ELSE 0 END) AS overdueAmount,
        SUM(CASE WHEN i.dueDate < NOW() AND (i.amount - COALESCE(p.paidAmount, 0)) > 0 THEN 1 ELSE 0 END) AS overdueCount,
        MIN(CASE WHEN (i.amount - COALESCE(p.paidAmount, 0)) > 0 THEN i.dueDate ELSE NULL END) AS nextDueDate
      FROM StudentFeeInstallment i
      JOIN Student s2 ON s2.id = i.studentId
      LEFT JOIN (
        SELECT installmentId, SUM(grossAmount) AS paidAmount
        FROM FinancialTransaction
        WHERE tenantId = ${tenantId}
          AND centerId = ${centerId}
          AND installmentId IS NOT NULL
          AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]})
        GROUP BY installmentId
      ) p ON p.installmentId = i.id
      WHERE i.tenantId = ${tenantId}
        AND s2.tenantId = ${tenantId}
        AND s2.hierarchyNodeId = ${centerId}
        AND i.dueDate >= ${from}
        AND i.dueDate < ${toExclusive}
      GROUP BY i.studentId
      HAVING pendingAmount > 0
    ) due ON due.studentId = s.id
    WHERE s.tenantId = ${tenantId}
      AND s.hierarchyNodeId = ${centerId}
      AND s.isActive = 1
    ORDER BY due.overdueAmount DESC, due.pendingAmount DESC, s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    studentId: String(row.id),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
    studentName: formatStudentName(row) || null,
    pendingAmount: toSafeNumber(row.pendingAmount),
    overdueAmount: toSafeNumber(row.overdueAmount),
    overdueCount: toSafeNumber(row.overdueCount),
    nextDueDate: row.nextDueDate instanceof Date ? row.nextDueDate : row.nextDueDate ? new Date(row.nextDueDate) : null
  }));

  return { items, total, limit, offset };
}

export { listPendingInstallments, listStudentWise, getMonthlyDues, listReminders };
