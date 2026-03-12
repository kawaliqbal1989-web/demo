import { Prisma } from "@prisma/client";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

const ALLOWED_FEE_SCHEDULE_TYPES = ["ADVANCE", "MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "LEVEL_WISE"];

function toDecimal(value) {
  if (value === null || value === undefined || value === "") {
    return new Prisma.Decimal("0");
  }

  if (value instanceof Prisma.Decimal) {
    return value;
  }

  const decimal = new Prisma.Decimal(String(value));
  if (!decimal.isFinite?.() && !Number.isFinite(Number(value))) {
    throw createHttpError(400, "Invalid amount", "INVALID_AMOUNT");
  }

  return decimal;
}

function assertNonNegative(decimal, fieldName) {
  if (decimal.lt(0)) {
    throw createHttpError(400, `${fieldName} must be >= 0`, "INVALID_AMOUNT");
  }
}

function clampPercent(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, parsed));
}

function quantize2(decimal) {
  return decimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function chooseAdjustmentInstallmentId({ tx, tenantId, studentId }) {
  const installments = await tx.studentFeeInstallment.findMany({
    where: {
      tenantId,
      studentId: String(studentId)
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      amount: true,
      payments: {
        where: {
          tenantId,
          type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
        },
        select: { grossAmount: true }
      }
    }
  });

  for (let index = installments.length - 1; index >= 0; index -= 1) {
    const installment = installments[index];
    const paid = installment.payments.reduce((sum, payment) => sum.add(toDecimal(payment.grossAmount)), new Prisma.Decimal("0"));
    if (paid.lt(toDecimal(installment.amount))) {
      return installment.id;
    }
  }

  return installments.length ? installments[installments.length - 1].id : null;
}

async function settleStudentFeesForAdjustment({ tx, tenantId, studentId }) {
  const student = await tx.student.findFirst({
    where: {
      id: String(studentId),
      tenantId
    },
    select: {
      id: true,
      totalFeeAmount: true
    }
  });

  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const paymentAggregate = await tx.financialTransaction.aggregate({
    where: {
      tenantId,
      studentId: student.id,
      type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
    },
    _sum: {
      grossAmount: true
    }
  });

  const totalPaid = quantize2(toDecimal(paymentAggregate._sum.grossAmount || 0));
  if (student.totalFeeAmount !== null && toDecimal(student.totalFeeAmount).gt(totalPaid)) {
    await tx.student.update({
      where: { id: student.id },
      data: {
        totalFeeAmount: totalPaid
      }
    });
  }

  const installments = await tx.studentFeeInstallment.findMany({
    where: {
      tenantId,
      studentId: student.id
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      payments: {
        where: {
          tenantId,
          type: { in: ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"] }
        },
        select: { grossAmount: true }
      }
    }
  });

  for (const installment of installments) {
    const settledAmount = quantize2(
      installment.payments.reduce((sum, payment) => sum.add(toDecimal(payment.grossAmount)), new Prisma.Decimal("0"))
    );

    await tx.studentFeeInstallment.update({
      where: { id: installment.id },
      data: {
        amount: settledAmount
      }
    });
  }
}

function computeShares(gross, percents) {
  const center = quantize2(gross.mul(percents.center).div(100));
  const franchise = quantize2(gross.mul(percents.franchise).div(100));
  const bp = quantize2(gross.mul(percents.bp).div(100));

  // Residual to platform to avoid rounding drift.
  const platform = quantize2(gross.sub(center).sub(franchise).sub(bp));

  return {
    centerShare: center,
    franchiseShare: franchise,
    bpShare: bp,
    platformShare: platform
  };
}

async function resolveActorChain({ tx, tenantId, actorUserId }) {
  const actor = await tx.authUser.findFirst({
    where: {
      id: actorUserId,
      tenantId,
      isActive: true
    },
    select: {
      id: true,
      role: true,
      hierarchyNodeId: true,
      parentUserId: true
    }
  });

  if (!actor) {
    throw createHttpError(403, "Actor user not found", "ACTOR_NOT_FOUND");
  }

  let franchiseUser = null;
  let bpUser = null;

  if (actor.parentUserId) {
    franchiseUser = await tx.authUser.findFirst({
      where: {
        id: actor.parentUserId,
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        role: true,
        hierarchyNodeId: true,
        parentUserId: true,
        email: true
      }
    });
  }

  if (franchiseUser?.parentUserId) {
    bpUser = await tx.authUser.findFirst({
      where: {
        id: franchiseUser.parentUserId,
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        role: true,
        hierarchyNodeId: true,
        email: true
      }
    });
  }

  return { actor, franchiseUser, bpUser };
}

async function resolveBusinessPartnerId({ tx, tenantId, bpUser }) {
  if (!bpUser) {
    return null;
  }

  const partner = await tx.businessPartner.findFirst({
    where: {
      tenantId,
      OR: [
        bpUser.hierarchyNodeId ? { hierarchyNodeId: bpUser.hierarchyNodeId } : undefined,
        bpUser.email ? { contactEmail: bpUser.email } : undefined
      ].filter(Boolean)
    },
    select: {
      id: true
    }
  });

  return partner?.id || null;
}

async function createTransaction({
  tx,
  tenantId,
  type,
  grossAmount,
  studentId,
  centerId,
  franchiseId,
  businessPartnerId,
  createdByUserId,
  paymentMode = null,
  receivedAt = null,
  feeScheduleType = null,
  feeMonth = null,
  feeYear = null,
  feeLevelId = null,
  paymentReference = null,
  installmentId = null
}) {
  const gross = toDecimal(grossAmount);
  assertNonNegative(gross, "grossAmount");

  let percents = {
    center: 0,
    franchise: 0,
    bp: 0
  };

  if (businessPartnerId) {
    const partner = await tx.businessPartner.findFirst({
      where: {
        id: businessPartnerId,
        tenantId
      },
      select: {
        centerSharePercent: true,
        franchiseSharePercent: true,
        bpSharePercent: true,
        platformSharePercent: true
      }
    });

    if (partner) {
      const center = clampPercent(partner.centerSharePercent, 0);
      const franchise = clampPercent(partner.franchiseSharePercent, 0);
      const bp = clampPercent(partner.bpSharePercent, 0);
      const platform = clampPercent(partner.platformSharePercent, 100);
      const sum = center + franchise + bp + platform;

      if (sum === 100) {
        percents = { center, franchise, bp };
      }
    }
  }

  const shares = computeShares(gross, percents);

  return tx.financialTransaction.create({
    data: {
      tenantId,
      type,
      businessPartnerId,
      studentId,
      centerId,
      franchiseId,
      paymentMode: paymentMode || null,
      receivedAt: receivedAt || null,
      feeScheduleType: feeScheduleType || null,
      feeMonth: feeMonth ?? null,
      feeYear: feeYear ?? null,
      feeLevelId: feeLevelId || null,
      installmentId: installmentId || null,
      paymentReference: paymentReference ? String(paymentReference).trim() : null,
      grossAmount: gross,
      centerShare: shares.centerShare,
      franchiseShare: shares.franchiseShare,
      bpShare: shares.bpShare,
      platformShare: shares.platformShare,
      createdByUserId
    }
  });
}

async function recordEnrollmentTransaction({ tx, tenantId, studentId, actorUserId, grossAmount = 0 }) {
  const student = await tx.student.findFirst({
    where: {
      id: studentId,
      tenantId
    },
    select: {
      id: true,
      hierarchyNodeId: true
    }
  });

  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  const { actor, franchiseUser, bpUser } = await resolveActorChain({ tx, tenantId, actorUserId });

  const centerId = actor.hierarchyNodeId || student.hierarchyNodeId;
  if (!centerId) {
    throw createHttpError(400, "centerId could not be resolved", "CENTER_ID_REQUIRED");
  }

  const franchiseId = franchiseUser?.hierarchyNodeId || null;
  const businessPartnerId = await resolveBusinessPartnerId({ tx, tenantId, bpUser });

  return createTransaction({
    tx,
    tenantId,
    type: "ENROLLMENT",
    grossAmount,
    studentId: student.id,
    centerId,
    franchiseId,
    businessPartnerId,
    createdByUserId: actor.id
  });
}

async function recordCompetitionTransaction({
  tx,
  tenantId,
  competitionId,
  studentId,
  actorUserId,
  grossAmount = 0
}) {
  const [student, competition] = await Promise.all([
    tx.student.findFirst({
      where: {
        id: studentId,
        tenantId
      },
      select: {
        id: true,
        hierarchyNodeId: true
      }
    }),
    tx.competition.findFirst({
      where: {
        id: competitionId,
        tenantId
      },
      select: {
        id: true,
        hierarchyNodeId: true
      }
    })
  ]);

  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (!competition) {
    throw createHttpError(404, "Competition not found", "COMPETITION_NOT_FOUND");
  }

  const { actor, franchiseUser, bpUser } = await resolveActorChain({ tx, tenantId, actorUserId });

  const centerId = actor.hierarchyNodeId || competition.hierarchyNodeId || student.hierarchyNodeId;
  if (!centerId) {
    throw createHttpError(400, "centerId could not be resolved", "CENTER_ID_REQUIRED");
  }

  const franchiseId = franchiseUser?.hierarchyNodeId || null;
  const businessPartnerId = await resolveBusinessPartnerId({ tx, tenantId, bpUser });

  return createTransaction({
    tx,
    tenantId,
    type: "COMPETITION",
    grossAmount,
    studentId: student.id,
    centerId,
    franchiseId,
    businessPartnerId,
    createdByUserId: actor.id
  });
}

async function recordStudentPaymentTransaction({
  tx,
  tenantId,
  studentId,
  actorUserId,
  type,
  grossAmount = 0,
  paymentMode = null,
  receivedAt = null,
  feeScheduleType = null,
  feeMonth = null,
  feeYear = null,
  feeLevelId = null,
  paymentReference = null,
  installmentId = null
}) {
  const normalizedType = String(type || "").trim().toUpperCase();
  if (!normalizedType) {
    throw createHttpError(400, "type is required", "VALIDATION_ERROR");
  }

  if (![["ENROLLMENT"], ["RENEWAL"], ["ADJUSTMENT"]].some(([t]) => t === normalizedType)) {
    throw createHttpError(400, "type must be ENROLLMENT, RENEWAL, or ADJUSTMENT", "VALIDATION_ERROR");
  }

  const normalizedPaymentMode = paymentMode === null || paymentMode === undefined || paymentMode === ""
    ? null
    : String(paymentMode).trim().toUpperCase();
  if (normalizedPaymentMode && !["CASH", "ONLINE", "GPAY", "PAYTM"].includes(normalizedPaymentMode)) {
    throw createHttpError(400, "paymentMode must be CASH, ONLINE, GPAY, or PAYTM", "VALIDATION_ERROR");
  }

  const normalizedSchedule = feeScheduleType === null || feeScheduleType === undefined || feeScheduleType === ""
    ? null
    : String(feeScheduleType).trim().toUpperCase();
  if (normalizedSchedule && !ALLOWED_FEE_SCHEDULE_TYPES.includes(normalizedSchedule)) {
    throw createHttpError(400, `feeScheduleType must be ${ALLOWED_FEE_SCHEDULE_TYPES.join(", ")}`, "VALIDATION_ERROR");
  }

  const parsedReceivedAt = receivedAt ? new Date(receivedAt) : null;
  if (receivedAt && Number.isNaN(parsedReceivedAt?.getTime?.())) {
    throw createHttpError(400, "receivedAt must be a valid date", "VALIDATION_ERROR");
  }

  const parsedFeeMonth = feeMonth === null || feeMonth === undefined || feeMonth === "" ? null : Number(feeMonth);
  const parsedFeeYear = feeYear === null || feeYear === undefined || feeYear === "" ? null : Number(feeYear);
  if (normalizedSchedule === "MONTHLY") {
    if (!Number.isInteger(parsedFeeMonth) || parsedFeeMonth < 1 || parsedFeeMonth > 12) {
      throw createHttpError(400, "feeMonth must be 1-12 for MONTHLY", "VALIDATION_ERROR");
    }
    if (!Number.isInteger(parsedFeeYear) || parsedFeeYear < 2000 || parsedFeeYear > 2100) {
      throw createHttpError(400, "feeYear must be 2000-2100 for MONTHLY", "VALIDATION_ERROR");
    }
  }
  const normalizedFeeLevelId = feeLevelId ? String(feeLevelId).trim() : null;
  if (normalizedSchedule === "LEVEL_WISE" && !normalizedFeeLevelId) {
    throw createHttpError(400, "feeLevelId is required for LEVEL_WISE", "VALIDATION_ERROR");
  }

  const normalizedInstallmentId = installmentId ? String(installmentId).trim() : null;
  const adjustedTotalAmount = quantize2(toDecimal(grossAmount));
  assertNonNegative(adjustedTotalAmount, "grossAmount");

  const student = await tx.student.findFirst({
    where: {
      id: studentId,
      tenantId
    },
    select: {
      id: true,
      hierarchyNodeId: true,
      totalFeeAmount: true,
      admissionFeeAmount: true
    }
  });

  if (!student) {
    throw createHttpError(404, "Student not found", "STUDENT_NOT_FOUND");
  }

  if (normalizedType === "ADJUSTMENT") {
    const currentTotal = student.totalFeeAmount == null ? null : quantize2(toDecimal(student.totalFeeAmount));
    const admissionFee = student.admissionFeeAmount == null ? null : quantize2(toDecimal(student.admissionFeeAmount));

    if (admissionFee !== null && adjustedTotalAmount.lt(admissionFee)) {
      throw createHttpError(400, "Adjustment amount cannot be less than admission fee", "VALIDATION_ERROR");
    }

    if (currentTotal !== null && adjustedTotalAmount.gt(currentTotal)) {
      throw createHttpError(400, "Adjustment amount cannot exceed current total fee", "VALIDATION_ERROR");
    }

    const { actor, franchiseUser, bpUser } = await resolveActorChain({ tx, tenantId, actorUserId });
    const centerId = actor.hierarchyNodeId || student.hierarchyNodeId;
    if (!centerId) {
      throw createHttpError(400, "centerId could not be resolved", "CENTER_ID_REQUIRED");
    }

    const franchiseId = franchiseUser?.hierarchyNodeId || null;
    const businessPartnerId = await resolveBusinessPartnerId({ tx, tenantId, bpUser });
    const previousTotalText = currentTotal == null ? "(not-set)" : currentTotal.toString();
    const noteText = paymentReference ? ` | note: ${String(paymentReference).trim()}` : "";
    const adjustmentReference = `TOTAL_FEE_ADJUSTMENT from ${previousTotalText} to ${adjustedTotalAmount.toString()}${noteText}`;

    const created = await createTransaction({
      tx,
      tenantId,
      type: normalizedType,
      grossAmount: 0,
      studentId: student.id,
      centerId,
      franchiseId,
      businessPartnerId,
      createdByUserId: actor.id,
      paymentMode: null,
      receivedAt: null,
      feeScheduleType: null,
      feeMonth: null,
      feeYear: null,
      feeLevelId: null,
      paymentReference: adjustmentReference,
      installmentId: null
    });

    await tx.student.update({
      where: { id: student.id },
      data: {
        totalFeeAmount: adjustedTotalAmount
      }
    });

    return created;
  }

  const effectiveInstallmentId = normalizedInstallmentId;

  if (effectiveInstallmentId) {
    const installment = await tx.studentFeeInstallment.findFirst({
      where: {
        id: effectiveInstallmentId,
        tenantId,
        studentId: String(studentId)
      },
      select: { id: true }
    });
    if (!installment) {
      throw createHttpError(400, "installmentId is not valid for this student", "VALIDATION_ERROR");
    }
  }

  const { actor, franchiseUser, bpUser } = await resolveActorChain({ tx, tenantId, actorUserId });

  const centerId = actor.hierarchyNodeId || student.hierarchyNodeId;
  if (!centerId) {
    throw createHttpError(400, "centerId could not be resolved", "CENTER_ID_REQUIRED");
  }

  const franchiseId = franchiseUser?.hierarchyNodeId || null;
  const businessPartnerId = await resolveBusinessPartnerId({ tx, tenantId, bpUser });

  const created = await createTransaction({
    tx,
    tenantId,
    type: normalizedType,
    grossAmount,
    studentId: student.id,
    centerId,
    franchiseId,
    businessPartnerId,
    createdByUserId: actor.id,
    paymentMode: normalizedPaymentMode,
    receivedAt: parsedReceivedAt,
    feeScheduleType: normalizedSchedule,
    feeMonth: parsedFeeMonth,
    feeYear: parsedFeeYear,
    feeLevelId: normalizedFeeLevelId,
    paymentReference,
    installmentId: effectiveInstallmentId
  });

  return created;
}

export { recordEnrollmentTransaction, recordCompetitionTransaction, recordStudentPaymentTransaction };