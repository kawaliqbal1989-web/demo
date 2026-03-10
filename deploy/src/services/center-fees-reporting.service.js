import { prisma } from "../lib/prisma.js";

const PAYMENT_TYPES = ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"];

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

async function listPendingInstallments({ tenantId, centerId, range, limit, offset }) {
  const from = range.from;
  const toExclusive = range.toExclusive;

  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(1) AS total
    FROM (
      SELECT i.id
      FROM StudentFeeInstallment i
      JOIN Student s ON s.id = i.studentId
      LEFT JOIN FinancialTransaction t
        ON t.installmentId = i.id
        AND t.tenantId = i.tenantId
        AND t.centerId = ${centerId}
        AND t.type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
      WHERE i.tenantId = ${tenantId}
        AND s.tenantId = ${tenantId}
        AND s.hierarchyNodeId = ${centerId}
        AND i.dueDate >= ${from}
        AND i.dueDate < ${toExclusive}
      GROUP BY i.id
      HAVING (i.amount - COALESCE(SUM(t.grossAmount), 0)) > 0
    ) x
  `;

  const total = toSafeNumber(Array.isArray(totalRows) ? totalRows[0]?.total : 0);

  const rows = await prisma.$queryRaw`
    SELECT
      i.id,
      i.studentId,
      i.amount,
      i.dueDate,
      s.admissionNo,
      s.firstName,
      s.lastName,
      COALESCE(SUM(t.grossAmount), 0) AS paidAmount
    FROM StudentFeeInstallment i
    JOIN Student s ON s.id = i.studentId
    LEFT JOIN FinancialTransaction t
      ON t.installmentId = i.id
      AND t.tenantId = i.tenantId
      AND t.centerId = ${centerId}
      AND t.type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
    WHERE i.tenantId = ${tenantId}
      AND s.tenantId = ${tenantId}
      AND s.hierarchyNodeId = ${centerId}
      AND i.dueDate >= ${from}
      AND i.dueDate < ${toExclusive}
    GROUP BY i.id
    HAVING (i.amount - COALESCE(SUM(t.grossAmount), 0)) > 0
    ORDER BY i.dueDate ASC, i.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const now = new Date();

  const items = (Array.isArray(rows) ? rows : []).map((row) => {
    const amount = toSafeNumber(row.amount);
    const paidAmount = toSafeNumber(row.paidAmount);
    const pending = Math.max(0, amount - paidAmount);

    let status = "PENDING";
    if (pending <= 0) status = "PAID";
    else if (paidAmount > 0) status = "PARTIAL";

    const dueDate = row.dueDate instanceof Date ? row.dueDate : row.dueDate ? new Date(row.dueDate) : null;
    if (status !== "PAID" && dueDate && dueDate.getTime() < now.getTime()) {
      status = "OVERDUE";
    }

    return {
      id: String(row.id),
      studentId: String(row.studentId),
      admissionNo: row.admissionNo ? String(row.admissionNo) : null,
      studentName: formatStudentName(row) || null,
      dueDate,
      amount,
      paidAmount,
      pending,
      status
    };
  });

  return { items, total, limit, offset };
}

async function listStudentWise({ tenantId, centerId, range, limit, offset }) {
  const from = range.from;
  const toExclusive = range.toExclusive;

  const totalRows = await prisma.$queryRaw`
    SELECT COUNT(1) AS total
    FROM (
      SELECT s.id
      FROM Student s
      LEFT JOIN (
        SELECT
          studentId,
          SUM(grossAmount) AS paidInRange
        FROM FinancialTransaction
        WHERE tenantId = ${tenantId}
          AND centerId = ${centerId}
          AND studentId IS NOT NULL
          AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
          AND createdAt >= ${from}
          AND createdAt < ${toExclusive}
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
          WHERE tenantId = ${tenantId}
            AND centerId = ${centerId}
            AND installmentId IS NOT NULL
            AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
          GROUP BY installmentId
        ) p ON p.installmentId = i.id
        WHERE i.tenantId = ${tenantId}
          AND s2.tenantId = ${tenantId}
          AND s2.hierarchyNodeId = ${centerId}
          AND i.dueDate >= ${from}
          AND i.dueDate < ${toExclusive}
        GROUP BY i.studentId
      ) due ON due.studentId = s.id
      WHERE s.tenantId = ${tenantId}
        AND s.hierarchyNodeId = ${centerId}
        AND s.isActive = 1
        AND (COALESCE(paid.paidInRange, 0) > 0 OR COALESCE(due.duePending, 0) > 0)
    ) x
  `;

  const total = toSafeNumber(Array.isArray(totalRows) ? totalRows[0]?.total : 0);

  const rows = await prisma.$queryRaw`
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
      WHERE tenantId = ${tenantId}
        AND centerId = ${centerId}
        AND studentId IS NOT NULL
        AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
        AND createdAt >= ${from}
        AND createdAt < ${toExclusive}
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
        WHERE tenantId = ${tenantId}
          AND centerId = ${centerId}
          AND installmentId IS NOT NULL
          AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
        GROUP BY installmentId
      ) p ON p.installmentId = i.id
      WHERE i.tenantId = ${tenantId}
        AND s2.tenantId = ${tenantId}
        AND s2.hierarchyNodeId = ${centerId}
        AND i.dueDate >= ${from}
        AND i.dueDate < ${toExclusive}
      GROUP BY i.studentId
    ) due ON due.studentId = s.id
    WHERE s.tenantId = ${tenantId}
      AND s.hierarchyNodeId = ${centerId}
      AND s.isActive = 1
      AND (COALESCE(paid.paidInRange, 0) > 0 OR COALESCE(due.duePending, 0) > 0)
    ORDER BY COALESCE(due.overduePending, 0) DESC,
      COALESCE(due.duePending, 0) DESC,
      COALESCE(paid.paidInRange, 0) DESC,
      s.admissionNo ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const items = (Array.isArray(rows) ? rows : []).map((row) => ({
    studentId: String(row.id),
    admissionNo: row.admissionNo ? String(row.admissionNo) : null,
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
        AND t.type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
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
            AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
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
          AND type IN (${PAYMENT_TYPES[0]}, ${PAYMENT_TYPES[1]}, ${PAYMENT_TYPES[2]})
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
