import { prisma } from "../lib/prisma.js";

const CASH_PAYMENT_TYPES = new Set(["ENROLLMENT", "RENEWAL"]);

function toSafeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value) {
  const num = toSafeNumber(value);
  return Number(num.toFixed(2));
}

function startOfUtcDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(value) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function addUtcMonths(value, months) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1, 0, 0, 0, 0));
}

function getDaysInUtcMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0)).getUTCDate();
}

function buildRecurringDueDate(templateDueDate, monthStart) {
  const template = templateDueDate instanceof Date ? templateDueDate : new Date(templateDueDate);
  const year = monthStart.getUTCFullYear();
  const monthIndex = monthStart.getUTCMonth();
  const day = Math.min(template.getUTCDate(), getDaysInUtcMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, day, 0, 0, 0, 0));
}

function buildMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getMonthKeyFromDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return buildMonthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

function normalizeInstallments(rawInstallments = []) {
  return [...rawInstallments]
    .map((installment) => ({
      id: String(installment.id),
      studentId: String(installment.studentId),
      amount: round2(installment.amount),
      dueDate: installment.dueDate instanceof Date ? installment.dueDate : new Date(installment.dueDate),
      isRecurringMonthly: Boolean(installment.isRecurringMonthly),
      recurrenceEndDate: installment.recurrenceEndDate
        ? (installment.recurrenceEndDate instanceof Date
          ? installment.recurrenceEndDate
          : new Date(installment.recurrenceEndDate))
        : null,
      createdAt: installment.createdAt instanceof Date ? installment.createdAt : new Date(installment.createdAt || Date.now())
    }))
    .sort((a, b) => {
      const byDue = a.dueDate.getTime() - b.dueDate.getTime();
      if (byDue !== 0) return byDue;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

function normalizePayments(rawPayments = []) {
  return [...rawPayments]
    .map((payment) => ({
      id: String(payment.id),
      studentId: String(payment.studentId),
      type: String(payment.type || "").toUpperCase(),
      amount: round2(payment.grossAmount),
      feeScheduleType: payment.feeScheduleType ? String(payment.feeScheduleType).toUpperCase() : null,
      feeMonth: payment.feeMonth == null ? null : Number(payment.feeMonth),
      feeYear: payment.feeYear == null ? null : Number(payment.feeYear),
      installmentId: payment.installmentId ? String(payment.installmentId) : null,
      effectiveAt: payment.receivedAt
        ? (payment.receivedAt instanceof Date ? payment.receivedAt : new Date(payment.receivedAt))
        : (payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt || Date.now())),
      createdAt: payment.createdAt instanceof Date ? payment.createdAt : new Date(payment.createdAt || Date.now())
    }))
    .sort((a, b) => {
      const byEffective = a.effectiveAt.getTime() - b.effectiveAt.getTime();
      if (byEffective !== 0) return byEffective;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
}

function normalizeMonthAdjustments(rawAdjustments = []) {
  return [...rawAdjustments]
    .map((adjustment) => ({
      id: String(adjustment.id),
      studentId: String(adjustment.studentId),
      year: Number(adjustment.year),
      month: Number(adjustment.month),
      adjustmentType: String(adjustment.adjustmentType || "").toUpperCase(),
      remarks: String(adjustment.remarks || ""),
      createdByUserId: String(adjustment.createdByUserId || ""),
      createdAt: adjustment.createdAt instanceof Date ? adjustment.createdAt : new Date(adjustment.createdAt || Date.now())
    }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function buildDueRowsFromInstallments({ installments, asOf }) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf || Date.now());
  const dueRows = [];

  for (const installment of installments) {
    if (!installment.isRecurringMonthly) {
      dueRows.push({
        id: installment.id,
        sourceInstallmentId: installment.id,
        dueDate: installment.dueDate,
        month: installment.dueDate.getUTCMonth() + 1,
        year: installment.dueDate.getUTCFullYear(),
        isVirtual: false,
        isRecurringMonthly: false,
        originalAmount: installment.amount,
        payableAmount: installment.amount,
        paidAmount: 0,
        pendingAmount: installment.amount,
        adjustmentType: null,
        adjustmentId: null,
        adjustmentRemarks: null
      });
      continue;
    }

    const recurringStartMonth = startOfUtcMonth(installment.dueDate);
    const asOfMonth = startOfUtcMonth(asOfDate);
    const recurrenceEndMonth = installment.recurrenceEndDate
      ? startOfUtcMonth(installment.recurrenceEndDate)
      : asOfMonth;

    const loopEndMonth = recurrenceEndMonth.getTime() < asOfMonth.getTime()
      ? recurrenceEndMonth
      : asOfMonth;

    if (loopEndMonth.getTime() < recurringStartMonth.getTime()) {
      continue;
    }

    let cursor = recurringStartMonth;
    while (cursor.getTime() <= loopEndMonth.getTime()) {
      const year = cursor.getUTCFullYear();
      const month = cursor.getUTCMonth() + 1;
      const monthKey = buildMonthKey(year, month);
      const virtualDueDate = buildRecurringDueDate(installment.dueDate, cursor);

      dueRows.push({
        id: `virtual:${installment.id}:${monthKey}`,
        sourceInstallmentId: installment.id,
        dueDate: virtualDueDate,
        month,
        year,
        isVirtual: true,
        isRecurringMonthly: true,
        originalAmount: installment.amount,
        payableAmount: installment.amount,
        paidAmount: 0,
        pendingAmount: installment.amount,
        adjustmentType: null,
        adjustmentId: null,
        adjustmentRemarks: null
      });

      cursor = addUtcMonths(cursor, 1);
    }
  }

  // Prevent duplicate monthly due generation for recurring templates.
  const seenRecurringMonths = new Set();
  const dedupedRows = [];
  for (const row of dueRows.sort((a, b) => {
    const byDate = a.dueDate.getTime() - b.dueDate.getTime();
    if (byDate !== 0) return byDate;
    return String(a.id).localeCompare(String(b.id));
  })) {
    if (row.isRecurringMonthly) {
      const monthKey = buildMonthKey(row.year, row.month);
      if (seenRecurringMonths.has(monthKey)) {
        continue;
      }
      seenRecurringMonths.add(monthKey);
    }
    dedupedRows.push(row);
  }

  return dedupedRows;
}

function applyMonthAdjustmentsToDues({ dueRows, monthAdjustments }) {
  const adjustmentByMonth = new Map();
  for (const adjustment of monthAdjustments) {
    adjustmentByMonth.set(buildMonthKey(adjustment.year, adjustment.month), adjustment);
  }

  for (const dueRow of dueRows) {
    if (!dueRow.isRecurringMonthly) continue;

    const key = buildMonthKey(dueRow.year, dueRow.month);
    const adjustment = adjustmentByMonth.get(key);
    if (!adjustment) continue;

    dueRow.adjustmentType = adjustment.adjustmentType;
    dueRow.adjustmentId = adjustment.id;
    dueRow.adjustmentRemarks = adjustment.remarks;
    dueRow.payableAmount = 0;
    dueRow.pendingAmount = 0;
  }
}

function allocateAmountToDueRow(dueRow, amount) {
  const remainingAmount = round2(amount);
  if (!dueRow || remainingAmount <= 0) return remainingAmount;

  const room = round2(dueRow.payableAmount - dueRow.paidAmount);
  if (room <= 0) return remainingAmount;

  const allocated = Math.min(room, remainingAmount);
  dueRow.paidAmount = round2(dueRow.paidAmount + allocated);
  dueRow.pendingAmount = round2(Math.max(dueRow.payableAmount - dueRow.paidAmount, 0));

  return round2(remainingAmount - allocated);
}

function deallocateAmountFromDueRow(dueRow, amount) {
  const remainingAmount = round2(amount);
  if (!dueRow || remainingAmount <= 0) return remainingAmount;

  const reversible = round2(dueRow.paidAmount);
  if (reversible <= 0) return remainingAmount;

  const reversed = Math.min(reversible, remainingAmount);
  dueRow.paidAmount = round2(Math.max(dueRow.paidAmount - reversed, 0));
  dueRow.pendingAmount = round2(Math.max(dueRow.payableAmount - dueRow.paidAmount, 0));

  return round2(remainingAmount - reversed);
}

function applyPaymentsToDues({ dueRows, payments }) {
  const unallocatedPayments = [];

  for (const payment of payments) {
    if (!CASH_PAYMENT_TYPES.has(payment.type)) continue;

    let remaining = round2(payment.amount);
    if (remaining === 0) continue;

    // Refund/cancellation reversals are represented as negative cash transactions.
    if (remaining < 0) {
      let reversalRemaining = round2(Math.abs(remaining));

      if (payment.installmentId) {
        const directDue = dueRows.find(
          (row) => !row.isRecurringMonthly && row.sourceInstallmentId === payment.installmentId
        );
        reversalRemaining = deallocateAmountFromDueRow(directDue, reversalRemaining);
      }

      if (
        reversalRemaining > 0 &&
        payment.feeScheduleType === "MONTHLY" &&
        Number.isInteger(payment.feeMonth) &&
        Number.isInteger(payment.feeYear)
      ) {
        const monthlyRows = dueRows
          .filter((row) => row.month === payment.feeMonth && row.year === payment.feeYear)
          .sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());

        for (const monthlyRow of monthlyRows) {
          reversalRemaining = deallocateAmountFromDueRow(monthlyRow, reversalRemaining);
          if (reversalRemaining <= 0) break;
        }
      }

      if (reversalRemaining > 0) {
        const reverseRows = [...dueRows].sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());
        for (const reverseRow of reverseRows) {
          reversalRemaining = deallocateAmountFromDueRow(reverseRow, reversalRemaining);
          if (reversalRemaining <= 0) break;
        }
      }

      continue;
    }

    if (payment.installmentId) {
      const directDue = dueRows.find(
        (row) => !row.isRecurringMonthly && row.sourceInstallmentId === payment.installmentId
      );
      remaining = allocateAmountToDueRow(directDue, remaining);
    }

    if (
      remaining > 0 &&
      payment.feeScheduleType === "MONTHLY" &&
      Number.isInteger(payment.feeMonth) &&
      Number.isInteger(payment.feeYear)
    ) {
      const monthlyRows = dueRows
        .filter((row) => row.month === payment.feeMonth && row.year === payment.feeYear)
        .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      for (const monthlyRow of monthlyRows) {
        remaining = allocateAmountToDueRow(monthlyRow, remaining);
        if (remaining <= 0) break;
      }
    }

    if (remaining > 0) {
      unallocatedPayments.push({
        id: payment.id,
        effectiveAt: payment.effectiveAt,
        amount: remaining
      });
    }
  }

  const fifoRows = [...dueRows].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  for (const pendingPayment of unallocatedPayments.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime())) {
    let remaining = pendingPayment.amount;
    for (const dueRow of fifoRows) {
      remaining = allocateAmountToDueRow(dueRow, remaining);
      if (remaining <= 0) break;
    }
    pendingPayment.amount = remaining;
  }

  return {
    unallocatedPaymentAmount: round2(
      unallocatedPayments.reduce((sum, payment) => sum + round2(payment.amount), 0)
    )
  };
}

function finalizeDueRowStatuses({ dueRows, asOf }) {
  const startOfToday = startOfUtcDay(asOf);

  for (const dueRow of dueRows) {
    if (dueRow.adjustmentType === "WAIVED") {
      dueRow.status = "WAIVED";
      dueRow.pendingAmount = 0;
      continue;
    }

    if (dueRow.adjustmentType === "PAUSED") {
      dueRow.status = "PAUSED";
      dueRow.pendingAmount = 0;
      continue;
    }

    if (dueRow.pendingAmount <= 0 && dueRow.payableAmount > 0) {
      dueRow.status = "PAID";
      continue;
    }

    if (dueRow.paidAmount > 0) {
      dueRow.status = "PARTIAL";
      continue;
    }

    dueRow.status = dueRow.dueDate.getTime() < startOfToday.getTime() ? "OVERDUE" : "PENDING";
  }
}

function summarizeTimeline({ dueRows, payments, unallocatedPaymentAmount }) {
  const totalDue = round2(dueRows.reduce((sum, row) => sum + round2(row.payableAmount), 0));
  const totalPaid = round2(dueRows.reduce((sum, row) => sum + round2(row.paidAmount), 0));
  const totalPending = round2(dueRows.reduce((sum, row) => sum + round2(row.pendingAmount), 0));
  const totalOverdue = round2(
    dueRows
      .filter((row) => row.status === "OVERDUE")
      .reduce((sum, row) => sum + round2(row.pendingAmount), 0)
  );
  const waivedMonths = dueRows.filter((row) => row.status === "WAIVED").length;
  const pausedMonths = dueRows.filter((row) => row.status === "PAUSED").length;
  const cashPaymentTotal = round2(
    payments
      .filter((payment) => CASH_PAYMENT_TYPES.has(payment.type))
      .reduce((sum, payment) => sum + round2(payment.amount), 0)
  );

  let status = null;
  if (totalDue > 0) {
    if (totalPending <= 0) {
      status = "PAID";
    } else if (totalOverdue > 0) {
      status = "OVERDUE";
    } else {
      status = "PENDING";
    }
  }

  return {
    totalDue,
    totalPaid,
    totalPending,
    totalOverdue,
    waivedMonths,
    pausedMonths,
    cashPaymentTotal,
    unallocatedPaymentAmount,
    status
  };
}

function buildTimeline({ installments, payments, monthAdjustments, asOf = new Date() }) {
  const normalizedInstallments = normalizeInstallments(installments);
  const normalizedPayments = normalizePayments(payments);
  const normalizedAdjustments = normalizeMonthAdjustments(monthAdjustments);

  const dueRows = buildDueRowsFromInstallments({ installments: normalizedInstallments, asOf });
  applyMonthAdjustmentsToDues({ dueRows, monthAdjustments: normalizedAdjustments });
  const { unallocatedPaymentAmount } = applyPaymentsToDues({ dueRows, payments: normalizedPayments });
  finalizeDueRowStatuses({ dueRows, asOf });

  const summary = summarizeTimeline({
    dueRows,
    payments: normalizedPayments,
    unallocatedPaymentAmount
  });

  const normalizedDues = dueRows.map((row) => ({
    id: row.id,
    sourceInstallmentId: row.sourceInstallmentId,
    dueDate: row.dueDate,
    year: row.year,
    month: row.month,
    monthKey: buildMonthKey(row.year, row.month),
    isVirtual: row.isVirtual,
    isRecurringMonthly: row.isRecurringMonthly,
    originalAmount: round2(row.originalAmount),
    amount: round2(row.payableAmount),
    paid: round2(row.paidAmount),
    pending: round2(row.pendingAmount),
    status: row.status,
    adjustmentType: row.adjustmentType,
    adjustmentId: row.adjustmentId,
    adjustmentRemarks: row.adjustmentRemarks
  }));

  return {
    dues: normalizedDues,
    summary
  };
}

function groupByStudentId(items = []) {
  const map = new Map();
  for (const item of items) {
    const studentId = String(item.studentId);
    if (!map.has(studentId)) map.set(studentId, []);
    map.get(studentId).push(item);
  }
  return map;
}

function isUnknownSelectFieldError(error, fieldNames = []) {
  const message = String(error?.message || "");
  if (!message) return false;
  return fieldNames.some((field) => message.includes(`Unknown field \`${field}\``) || message.includes(`Unknown arg \`${field}\``));
}

async function fetchInstallmentsWithSchemaFallback({ tx, tenantId, ids }) {
  try {
    return await tx.studentFeeInstallment.findMany({
      where: {
        tenantId,
        studentId: { in: ids }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        studentId: true,
        amount: true,
        dueDate: true,
        isRecurringMonthly: true,
        recurrenceEndDate: true,
        createdAt: true
      }
    });
  } catch (error) {
    if (!isUnknownSelectFieldError(error, ["recurrenceEndDate", "createdAt"])) {
      throw error;
    }

    // Production compatibility fallback: older schemas may not include recurrence metadata columns.
    return tx.studentFeeInstallment.findMany({
      where: {
        tenantId,
        studentId: { in: ids }
      },
      orderBy: [{ dueDate: "asc" }],
      select: {
        id: true,
        studentId: true,
        amount: true,
        dueDate: true,
        isRecurringMonthly: true
      }
    });
  }
}

async function fetchPaymentsWithSchemaFallback({ tx, tenantId, ids }) {
  try {
    return await tx.financialTransaction.findMany({
      where: {
        tenantId,
        studentId: { in: ids },
        type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        studentId: true,
        type: true,
        grossAmount: true,
        feeScheduleType: true,
        feeMonth: true,
        feeYear: true,
        installmentId: true,
        receivedAt: true,
        createdAt: true
      }
    });
  } catch (error) {
    if (!isUnknownSelectFieldError(error, ["feeScheduleType", "feeMonth", "feeYear", "installmentId"])) {
      throw error;
    }

    // Fallback preserves FIFO allocation behavior when schedule-specific fields are unavailable.
    return tx.financialTransaction.findMany({
      where: {
        tenantId,
        studentId: { in: ids },
        type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
      },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        studentId: true,
        type: true,
        grossAmount: true,
        receivedAt: true,
        createdAt: true
      }
    });
  }
}

async function fetchMonthAdjustmentsWithSchemaFallback({ tx, tenantId, ids }) {
  try {
    return await tx.studentFeeMonthAdjustment.findMany({
      where: {
        tenantId,
        studentId: { in: ids }
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        studentId: true,
        year: true,
        month: true,
        adjustmentType: true,
        remarks: true,
        createdByUserId: true,
        createdAt: true
      }
    });
  } catch (error) {
    if (!isUnknownSelectFieldError(error, ["createdByUserId"])) {
      throw error;
    }

    return tx.studentFeeMonthAdjustment.findMany({
      where: {
        tenantId,
        studentId: { in: ids }
      },
      orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        studentId: true,
        year: true,
        month: true,
        adjustmentType: true,
        remarks: true,
        createdAt: true
      }
    });
  }
}

async function computeFeeTimelinesForStudents({ tenantId, studentIds, asOf = new Date(), tx = prisma }) {
  const ids = Array.from(new Set((studentIds || []).map((id) => String(id).trim()).filter(Boolean)));
  if (!ids.length) {
    return new Map();
  }

  const [installments, payments, monthAdjustments] = await Promise.all([
    fetchInstallmentsWithSchemaFallback({ tx, tenantId, ids }),
    fetchPaymentsWithSchemaFallback({ tx, tenantId, ids }),
    fetchMonthAdjustmentsWithSchemaFallback({ tx, tenantId, ids })
  ]);

  const installmentsByStudent = groupByStudentId(installments);
  const paymentsByStudent = groupByStudentId(payments);
  const adjustmentsByStudent = groupByStudentId(monthAdjustments);

  const result = new Map();
  for (const studentId of ids) {
    result.set(
      studentId,
      buildTimeline({
        installments: installmentsByStudent.get(studentId) || [],
        payments: paymentsByStudent.get(studentId) || [],
        monthAdjustments: adjustmentsByStudent.get(studentId) || [],
        asOf
      })
    );
  }

  return result;
}

async function computeStudentFeeTimeline({ tenantId, studentId, asOf = new Date(), tx = prisma }) {
  const timelines = await computeFeeTimelinesForStudents({
    tenantId,
    studentIds: [studentId],
    asOf,
    tx
  });

  return (
    timelines.get(String(studentId)) || {
      dues: [],
      summary: {
        totalDue: 0,
        totalPaid: 0,
        totalPending: 0,
        totalOverdue: 0,
        waivedMonths: 0,
        pausedMonths: 0,
        cashPaymentTotal: 0,
        unallocatedPaymentAmount: 0,
        status: null
      }
    }
  );
}

function buildMonthWindowKey({ year, month }) {
  return buildMonthKey(year, month);
}

function getMonthKeyForDate(value) {
  return getMonthKeyFromDate(value);
}

export {
  buildMonthWindowKey,
  computeFeeTimelinesForStudents,
  computeStudentFeeTimeline,
  getMonthKeyForDate
};
