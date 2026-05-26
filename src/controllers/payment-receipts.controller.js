import { asyncHandler } from "../utils/async-handler.js";
import { prisma } from "../lib/prisma.js";
import {
  cancelPaymentReceipt,
  collectPaymentReceipt,
  getPaymentReceiptById,
  listStudentPaymentReceipts,
  previewReceiptAllocation,
  refundPaymentReceipt
} from "../services/payment-receipt.service.js";
import { renderPaymentReceiptPdf } from "../services/payment-receipt-pdf.service.js";

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

const previewStudentReceiptAllocation = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const amount = toNumberOrNull(req.body?.amount);

  const data = await previewReceiptAllocation({
    tx: prisma,
    tenantId: req.auth.tenantId,
    studentId,
    amount,
    asOf: new Date()
  });

  return res.apiSuccess("Receipt allocation preview generated", data);
});

const collectStudentPaymentReceipt = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const amount = toNumberOrNull(req.body?.amount);

  const created = await prisma.$transaction((tx) =>
    collectPaymentReceipt({
      tx,
      tenantId: req.auth.tenantId,
      studentId,
      actorUserId: req.auth.userId,
      paymentType: req.body?.paymentType,
      amount,
      paymentMode: req.body?.paymentMode,
      collectedAt: req.body?.collectedAt,
      referenceNumber: req.body?.referenceNumber,
      transactionId: req.body?.transactionId,
      notes: req.body?.notes
    })
  );

  res.locals.entityId = created.id;
  return res.apiSuccess("Payment receipt created", created, 201);
});

const listStudentReceipts = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const limit = toNumberOrNull(req.query.limit) ?? 50;
  const offset = toNumberOrNull(req.query.offset) ?? 0;

  const items = await listStudentPaymentReceipts({
    tx: prisma,
    tenantId: req.auth.tenantId,
    studentId,
    limit,
    offset
  });

  return res.apiSuccess("Student receipts fetched", {
    items,
    total: items.length,
    limit,
    offset
  });
});

const getStudentReceiptById = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const receiptId = String(req.params.receiptId || "").trim();

  const receipt = await getPaymentReceiptById({
    tx: prisma,
    tenantId: req.auth.tenantId,
    studentId,
    receiptId
  });

  return res.apiSuccess("Student receipt fetched", receipt);
});

const downloadStudentReceiptPdf = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const receiptId = String(req.params.receiptId || "").trim();

  const receipt = await prisma.$transaction(async (tx) => {
    const found = await getPaymentReceiptById({
      tx,
      tenantId: req.auth.tenantId,
      studentId,
      receiptId
    });

    await tx.receiptAuditLog.create({
      data: {
        tenantId: req.auth.tenantId,
        receiptId: found.id,
        actorUserId: req.auth.userId,
        action: "PDF_RENDERED",
        metadata: {
          route: req.originalUrl || null
        }
      }
    });

    return found;
  });

  const pdfBuffer = await renderPaymentReceiptPdf({ receipt });
  const filename = `${receipt.receiptNumber}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
  return res.send(pdfBuffer);
});

const refundStudentReceipt = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const receiptId = String(req.params.receiptId || "").trim();
  const amount = toNumberOrNull(req.body?.amount);

  const updated = await prisma.$transaction((tx) =>
    refundPaymentReceipt({
      tx,
      tenantId: req.auth.tenantId,
      studentId,
      receiptId,
      actorUserId: req.auth.userId,
      amount,
      paymentMode: req.body?.paymentMode,
      referenceNumber: req.body?.referenceNumber,
      transactionId: req.body?.transactionId,
      reason: req.body?.reason
    })
  );

  res.locals.entityId = updated.id;
  return res.apiSuccess("Receipt refunded", updated);
});

const cancelStudentReceipt = asyncHandler(async (req, res) => {
  const studentId = String(req.params.id || "").trim();
  const receiptId = String(req.params.receiptId || "").trim();

  const updated = await prisma.$transaction((tx) =>
    cancelPaymentReceipt({
      tx,
      tenantId: req.auth.tenantId,
      studentId,
      receiptId,
      actorUserId: req.auth.userId,
      reason: req.body?.reason,
      paymentMode: req.body?.paymentMode || "CASH"
    })
  );

  res.locals.entityId = updated.id;
  return res.apiSuccess("Receipt cancelled", updated);
});

export {
  previewStudentReceiptAllocation,
  collectStudentPaymentReceipt,
  listStudentReceipts,
  getStudentReceiptById,
  downloadStudentReceiptPdf,
  refundStudentReceipt,
  cancelStudentReceipt
};
