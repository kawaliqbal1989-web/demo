import { Prisma } from "../lib/prisma-compat.js";
import { computeStudentFeeTimeline } from "./student-fee-due.service.js";
import { recordStudentPaymentTransaction } from "./financial-ledger.service.js";

const SUPPORTED_PAYMENT_MODES = new Set([
  "CASH",
  "UPI",
  "BANK_TRANSFER",
  "CARD",
  "CHEQUE",
  "ONLINE_GATEWAY",
  "ONLINE",
  "GPAY",
  "PAYTM"
]);

const SUPPORTED_PAYMENT_TYPES = new Set(["ENROLLMENT", "RENEWAL"]);

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function toDecimal(value) {
  if (value instanceof Prisma.Decimal) return value;
  return new Prisma.Decimal(String(value ?? 0));
}

function round2(value) {
  return Number(Number(value || 0).toFixed(2));
}

function sanitizePrefix(raw) {
  const cleaned = String(raw || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
  if (!cleaned) return "RCPT";
  return cleaned.slice(0, 12);
}

function resolveFinancialYear(dateValue) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue || Date.now());
  return date.getUTCFullYear();
}

function normalizePaymentMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!SUPPORTED_PAYMENT_MODES.has(normalized)) {
    throw createHttpError(400, "Unsupported payment mode", "VALIDATION_ERROR");
  }
  return normalized;
}

function normalizePaymentType(value) {
  const normalized = String(value || "RENEWAL").trim().toUpperCase();
  if (!SUPPORTED_PAYMENT_TYPES.has(normalized)) {
    throw createHttpError(400, "paymentType must be ENROLLMENT or RENEWAL", "VALIDATION_ERROR");
  }
  return normalized;
}

function buildAllocationPreview({ dues = [], amount }) {
  let remaining = round2(amount);
  const normalizedDues = [...dues]
    .filter((row) => round2(row.pending) > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const allocations = [];

  for (const due of normalizedDues) {
    if (remaining <= 0) break;

    const pending = round2(due.pending);
    if (pending <= 0) continue;

    const allocated = round2(Math.min(remaining, pending));
    const pendingAfter = round2(pending - allocated);

    allocations.push({
      allocationType: "DUE",
      sourceInstallmentId: due.sourceInstallmentId || due.id || null,
      dueDate: due.dueDate || null,
      dueYear: due.year ?? null,
      dueMonth: due.month ?? null,
      dueStatusBefore: due.status || null,
      duePendingBefore: pending,
      allocatedAmount: allocated,
      duePendingAfter: pendingAfter
    });

    remaining = round2(remaining - allocated);
  }

  if (remaining > 0) {
    allocations.push({
      allocationType: "OVERPAYMENT",
      sourceInstallmentId: null,
      dueDate: null,
      dueYear: null,
      dueMonth: null,
      dueStatusBefore: null,
      duePendingBefore: 0,
      allocatedAmount: remaining,
      duePendingAfter: 0
    });
  }

  const allocatedTotal = round2(allocations
    .filter((row) => row.allocationType === "DUE")
    .reduce((sum, row) => sum + round2(row.allocatedAmount), 0));
  const unallocatedTotal = round2(allocations
    .filter((row) => row.allocationType === "OVERPAYMENT")
    .reduce((sum, row) => sum + round2(row.allocatedAmount), 0));

  return {
    allocations,
    allocatedTotal,
    unallocatedTotal,
    remainingBalanceAfterPayment: round2(Math.max((normalizedDues.reduce((sum, row) => sum + round2(row.pending), 0) - allocatedTotal), 0))
  };
}

async function resolveCenterPrefix({ tx, tenantId, centerId }) {
  const node = await tx.hierarchyNode.findFirst({
    where: { id: centerId, tenantId },
    select: { code: true, name: true }
  });
  return sanitizePrefix(node?.code || node?.name || "RCPT");
}

async function reserveReceiptNumber({ tx, tenantId, centerId, collectedAt }) {
  const financialYear = resolveFinancialYear(collectedAt);
  const prefix = await resolveCenterPrefix({ tx, tenantId, centerId });

  await tx.receiptSequence.upsert({
    where: {
      tenantId_centerId_financialYear_prefix: {
        tenantId,
        centerId,
        financialYear,
        prefix
      }
    },
    create: {
      tenantId,
      centerId,
      financialYear,
      prefix,
      lastNumber: 0
    },
    update: {}
  });

  const sequence = await tx.receiptSequence.update({
    where: {
      tenantId_centerId_financialYear_prefix: {
        tenantId,
        centerId,
        financialYear,
        prefix
      }
    },
    data: {
      lastNumber: { increment: 1 }
    },
    select: { lastNumber: true }
  });

  const sequenceNumber = Number(sequence.lastNumber || 0);
  const receiptNumber = `${prefix}-${financialYear}-${String(sequenceNumber).padStart(6, "0")}`;

  return { financialYear, prefix, sequenceNumber, receiptNumber };
}

async function createReceiptAuditLog({ tx, tenantId, receiptId, actorUserId, action, metadata }) {
  return tx.receiptAuditLog.create({
    data: {
      tenantId,
      receiptId,
      actorUserId: actorUserId || null,
      action,
      metadata: metadata || null
    }
  });
}

async function assertStudentInTenant({ tx, tenantId, studentId }) {
  const student = await tx.student.findFirst({
    where: { id: studentId, tenantId },
    select: { id: true, tenantId: true, hierarchyNodeId: true }
  });
  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }
  return student;
}

async function previewReceiptAllocation({ tx, tenantId, studentId, amount, asOf = new Date() }) {
  const paymentAmount = round2(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw createHttpError(400, "amount must be > 0", "VALIDATION_ERROR");
  }

  await assertStudentInTenant({ tx, tenantId, studentId });

  const timeline = await computeStudentFeeTimeline({
    tx,
    tenantId,
    studentId,
    asOf
  });

  return {
    summary: timeline.summary,
    preview: buildAllocationPreview({ dues: timeline.dues || [], amount: paymentAmount })
  };
}

async function collectPaymentReceipt({
  tx,
  tenantId,
  studentId,
  actorUserId,
  paymentType = "RENEWAL",
  amount,
  paymentMode,
  collectedAt,
  referenceNumber,
  transactionId,
  notes
}) {
  const collectedDate = collectedAt ? new Date(collectedAt) : new Date();
  if (Number.isNaN(collectedDate.getTime())) {
    throw createHttpError(400, "Invalid collectedAt", "VALIDATION_ERROR");
  }

  const grossAmount = round2(amount);
  if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
    throw createHttpError(400, "amount must be > 0", "VALIDATION_ERROR");
  }

  const normalizedPaymentMode = normalizePaymentMode(paymentMode);
  const normalizedPaymentType = normalizePaymentType(paymentType);

  const student = await assertStudentInTenant({ tx, tenantId, studentId });

  const actor = await tx.authUser.findFirst({
    where: {
      id: actorUserId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      hierarchyNodeId: true
    }
  });

  if (!actor) {
    throw createHttpError(403, "Actor not found", "ACTOR_NOT_FOUND");
  }

  const centerId = actor.hierarchyNodeId || student.hierarchyNodeId;
  if (!centerId) {
    throw createHttpError(400, "Unable to resolve center ownership", "CENTER_ID_REQUIRED");
  }

  const allocationContext = await previewReceiptAllocation({
    tx,
    tenantId,
    studentId,
    amount: grossAmount,
    asOf: collectedDate
  });

  const numbering = await reserveReceiptNumber({
    tx,
    tenantId,
    centerId,
    collectedAt: collectedDate
  });

  const financialTransaction = await recordStudentPaymentTransaction({
    tx,
    tenantId,
    studentId,
    actorUserId,
    type: normalizedPaymentType,
    grossAmount,
    paymentMode: normalizedPaymentMode,
    receivedAt: collectedDate,
    feeScheduleType: "ADVANCE",
    paymentReference: transactionId || referenceNumber || null,
    installmentId: null
  });

  const receipt = await tx.paymentReceipt.create({
    data: {
      tenantId,
      centerId,
      studentId,
      receiptNumber: numbering.receiptNumber,
      financialYear: numbering.financialYear,
      sequenceNumber: numbering.sequenceNumber,
      prefix: numbering.prefix,
      paymentMode: normalizedPaymentMode,
      totalAmount: toDecimal(grossAmount),
      allocatedAmount: toDecimal(allocationContext.preview.allocatedTotal),
      unallocatedAmount: toDecimal(allocationContext.preview.unallocatedTotal),
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
      transactionId: transactionId ? String(transactionId).trim() : null,
      notes: notes ? String(notes).trim() : null,
      collectedAt: collectedDate,
      collectedByUserId: actorUserId
    }
  });

  await tx.paymentTransaction.create({
    data: {
      tenantId,
      receiptId: receipt.id,
      financialTransactionId: financialTransaction.id,
      studentId,
      centerId,
      amount: toDecimal(grossAmount),
      paymentMode: normalizedPaymentMode,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
      transactionId: transactionId ? String(transactionId).trim() : null,
      collectedAt: collectedDate,
      createdByUserId: actorUserId
    }
  });

  if (allocationContext.preview.allocations.length) {
    await tx.receiptAllocation.createMany({
      data: allocationContext.preview.allocations.map((allocation) => ({
        tenantId,
        receiptId: receipt.id,
        studentId,
        allocationType: allocation.allocationType,
        sourceInstallmentId: allocation.sourceInstallmentId,
        dueDate: allocation.dueDate ? new Date(allocation.dueDate) : null,
        dueYear: allocation.dueYear,
        dueMonth: allocation.dueMonth,
        dueStatusBefore: allocation.dueStatusBefore,
        duePendingBefore: allocation.duePendingBefore == null ? null : toDecimal(allocation.duePendingBefore),
        allocatedAmount: toDecimal(allocation.allocatedAmount),
        duePendingAfter: allocation.duePendingAfter == null ? null : toDecimal(allocation.duePendingAfter)
      }))
    });
  }

  await createReceiptAuditLog({
    tx,
    tenantId,
    receiptId: receipt.id,
    actorUserId,
    action: "CREATED",
    metadata: {
      receiptNumber: numbering.receiptNumber,
      paymentMode: normalizedPaymentMode,
      grossAmount,
      allocationCount: allocationContext.preview.allocations.length
    }
  });

  await createReceiptAuditLog({
    tx,
    tenantId,
    receiptId: receipt.id,
    actorUserId,
    action: "ALLOCATED",
    metadata: {
      allocatedAmount: allocationContext.preview.allocatedTotal,
      unallocatedAmount: allocationContext.preview.unallocatedTotal
    }
  });

  return tx.paymentReceipt.findFirst({
    where: { id: receipt.id, tenantId },
    include: {
      allocations: { orderBy: { createdAt: "asc" } },
      paymentTransactions: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { processedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      collectedBy: { select: { id: true, username: true, email: true, role: true } },
      cancelledBy: { select: { id: true, username: true, email: true, role: true } }
    }
  });
}

function getRefundableAmount(receipt, refunds = []) {
  const totalAmount = round2(receipt?.totalAmount);
  const refunded = round2((refunds || []).reduce((sum, row) => sum + round2(row.amount), 0));
  return round2(Math.max(totalAmount - refunded, 0));
}

async function createRefundFinancialReversal({
  tx,
  tenantId,
  receipt,
  actorUserId,
  allocation,
  amount,
  paymentMode,
  referenceNumber
}) {
  return tx.financialTransaction.create({
    data: {
      tenantId,
      studentId: receipt.studentId,
      centerId: receipt.centerId,
      type: "RENEWAL",
      paymentMode,
      receivedAt: new Date(),
      installmentId: allocation.sourceInstallmentId || null,
      paymentReference: referenceNumber || `REFUND:${receipt.receiptNumber}`,
      grossAmount: toDecimal(-Math.abs(amount)),
      centerShare: toDecimal(-Math.abs(amount)),
      franchiseShare: toDecimal(0),
      bpShare: toDecimal(0),
      platformShare: toDecimal(0),
      createdByUserId: actorUserId
    }
  });
}

async function refundPaymentReceipt({
  tx,
  tenantId,
  studentId,
  receiptId,
  actorUserId,
  amount,
  paymentMode,
  referenceNumber,
  transactionId,
  reason
}) {
  const normalizedPaymentMode = normalizePaymentMode(paymentMode);
  const refundAmount = round2(amount);
  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    throw createHttpError(400, "Refund amount must be > 0", "VALIDATION_ERROR");
  }

  const receipt = await tx.paymentReceipt.findFirst({
    where: {
      id: receiptId,
      tenantId,
      studentId
    },
    include: {
      allocations: {
        orderBy: [{ createdAt: "asc" }]
      },
      refunds: true
    }
  });

  if (!receipt) {
    throw createHttpError(404, "Receipt not found", "RECEIPT_NOT_FOUND");
  }

  if (receipt.status === "CANCELLED") {
    throw createHttpError(400, "Cannot refund a cancelled receipt", "RECEIPT_CANCELLED");
  }

  const refundableAmount = getRefundableAmount(receipt, receipt.refunds);
  if (refundAmount > refundableAmount) {
    throw createHttpError(400, "Refund exceeds refundable amount", "REFUND_EXCEEDS_BALANCE");
  }

  const remainingByAllocation = new Map();
  for (const allocation of receipt.allocations) {
    if (allocation.allocationType !== "DUE") continue;
    remainingByAllocation.set(allocation.id, round2(allocation.allocatedAmount));
  }

  for (const allocation of receipt.allocations) {
    if (allocation.allocationType !== "REVERSAL") continue;
    if (!allocation.reversalOfAllocationId) continue;
    const prev = round2(remainingByAllocation.get(allocation.reversalOfAllocationId) || 0);
    remainingByAllocation.set(allocation.reversalOfAllocationId, round2(prev + round2(allocation.allocatedAmount)));
  }

  let remainingRefund = refundAmount;
  const reversibleAllocations = receipt.allocations
    .filter((row) => row.allocationType === "DUE")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const allocation of reversibleAllocations) {
    if (remainingRefund <= 0) break;

    const allocRemaining = round2(remainingByAllocation.get(allocation.id) || 0);
    if (allocRemaining <= 0) continue;

    const reversedAmount = round2(Math.min(allocRemaining, remainingRefund));
    remainingRefund = round2(remainingRefund - reversedAmount);

    await tx.receiptAllocation.create({
      data: {
        tenantId,
        receiptId: receipt.id,
        studentId: receipt.studentId,
        allocationType: "REVERSAL",
        sourceInstallmentId: allocation.sourceInstallmentId,
        dueDate: allocation.dueDate,
        dueYear: allocation.dueYear,
        dueMonth: allocation.dueMonth,
        dueStatusBefore: allocation.dueStatusBefore,
        duePendingBefore: allocation.duePendingAfter,
        allocatedAmount: toDecimal(-reversedAmount),
        duePendingAfter: allocation.duePendingBefore,
        reversalOfAllocationId: allocation.id
      }
    });

    await createRefundFinancialReversal({
      tx,
      tenantId,
      receipt,
      actorUserId,
      allocation,
      amount: reversedAmount,
      paymentMode: normalizedPaymentMode,
      referenceNumber: referenceNumber || transactionId || `REFUND:${receipt.receiptNumber}`
    });
  }

  if (remainingRefund > 0) {
    await tx.receiptAllocation.create({
      data: {
        tenantId,
        receiptId: receipt.id,
        studentId: receipt.studentId,
        allocationType: "REVERSAL",
        sourceInstallmentId: null,
        dueDate: null,
        dueYear: null,
        dueMonth: null,
        dueStatusBefore: "OVERPAYMENT",
        duePendingBefore: toDecimal(0),
        allocatedAmount: toDecimal(-remainingRefund),
        duePendingAfter: toDecimal(0)
      }
    });
  }

  const refund = await tx.refundTransaction.create({
    data: {
      tenantId,
      receiptId: receipt.id,
      studentId: receipt.studentId,
      centerId: receipt.centerId,
      amount: toDecimal(refundAmount),
      paymentMode: normalizedPaymentMode,
      referenceNumber: referenceNumber ? String(referenceNumber).trim() : null,
      transactionId: transactionId ? String(transactionId).trim() : null,
      reason: String(reason || "Refund processed"),
      processedAt: new Date(),
      processedByUserId: actorUserId
    }
  });

  const refreshedRefunds = [...receipt.refunds, refund];
  const nextRefundableAmount = getRefundableAmount(receipt, refreshedRefunds);
  const nextStatus = nextRefundableAmount <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";

  await tx.paymentReceipt.update({
    where: { id: receipt.id },
    data: {
      status: nextStatus
    }
  });

  await createReceiptAuditLog({
    tx,
    tenantId,
    receiptId: receipt.id,
    actorUserId,
    action: "REFUNDED",
    metadata: {
      refundId: refund.id,
      amount: refundAmount,
      reason: String(reason || "")
    }
  });

  return tx.paymentReceipt.findFirst({
    where: { id: receipt.id, tenantId, studentId },
    include: {
      allocations: { orderBy: { createdAt: "asc" } },
      paymentTransactions: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { processedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 }
    }
  });
}

async function cancelPaymentReceipt({
  tx,
  tenantId,
  studentId,
  receiptId,
  actorUserId,
  reason,
  paymentMode = "CASH"
}) {
  const receipt = await tx.paymentReceipt.findFirst({
    where: {
      id: receiptId,
      tenantId,
      studentId
    },
    include: {
      refunds: true
    }
  });

  if (!receipt) {
    throw createHttpError(404, "Receipt not found", "RECEIPT_NOT_FOUND");
  }

  if (receipt.status === "CANCELLED") {
    return receipt;
  }

  const refundableAmount = getRefundableAmount(receipt, receipt.refunds);
  if (refundableAmount > 0) {
    await refundPaymentReceipt({
      tx,
      tenantId,
      studentId,
      receiptId,
      actorUserId,
      amount: refundableAmount,
      paymentMode,
      referenceNumber: `CANCEL:${receipt.receiptNumber}`,
      reason: reason || "Receipt cancelled"
    });
  }

  await tx.paymentReceipt.update({
    where: { id: receipt.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: actorUserId,
      cancelReason: reason ? String(reason).trim() : "Receipt cancelled"
    }
  });

  await createReceiptAuditLog({
    tx,
    tenantId,
    receiptId: receipt.id,
    actorUserId,
    action: "CANCELLED",
    metadata: {
      reason: reason ? String(reason).trim() : "Receipt cancelled"
    }
  });

  return tx.paymentReceipt.findFirst({
    where: { id: receipt.id, tenantId, studentId },
    include: {
      allocations: { orderBy: { createdAt: "asc" } },
      paymentTransactions: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { processedAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      collectedBy: { select: { id: true, username: true, email: true, role: true } },
      cancelledBy: { select: { id: true, username: true, email: true, role: true } }
    }
  });
}

async function listStudentPaymentReceipts({ tx, tenantId, studentId, limit = 50, offset = 0 }) {
  return tx.paymentReceipt.findMany({
    where: {
      tenantId,
      studentId
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(200, Math.max(1, Number(limit) || 50)),
    skip: Math.max(0, Number(offset) || 0),
    include: {
      collectedBy: { select: { id: true, username: true, email: true, role: true } },
      cancelledBy: { select: { id: true, username: true, email: true, role: true } },
      allocations: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { processedAt: "desc" } }
    }
  });
}

async function getPaymentReceiptById({ tx, tenantId, studentId, receiptId }) {
  const receipt = await tx.paymentReceipt.findFirst({
    where: {
      id: receiptId,
      tenantId,
      studentId
    },
    include: {
      collectedBy: { select: { id: true, username: true, email: true, role: true } },
      cancelledBy: { select: { id: true, username: true, email: true, role: true } },
      paymentTransactions: { orderBy: { createdAt: "asc" } },
      allocations: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { processedAt: "desc" } },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { id: true, username: true, email: true, role: true } }
        }
      },
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          phonePrimary: true,
          guardianPhone: true
        }
      },
      center: {
        select: {
          id: true,
          name: true,
          code: true
        }
      }
    }
  });

  if (!receipt) {
    throw createHttpError(404, "Receipt not found", "RECEIPT_NOT_FOUND");
  }

  return receipt;
}

export {
  buildAllocationPreview,
  getRefundableAmount,
  previewReceiptAllocation,
  collectPaymentReceipt,
  refundPaymentReceipt,
  cancelPaymentReceipt,
  listStudentPaymentReceipts,
  getPaymentReceiptById
};
