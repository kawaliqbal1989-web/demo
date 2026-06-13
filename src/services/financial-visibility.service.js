import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { computeFeeTimelinesForStudents, computeStudentFeeTimeline } from "./student-fee-due.service.js";
import { createNotification } from "./notification.service.js";
import { resolveParentVisibilityScope } from "./parent-visibility.service.js";

const CASH_TYPES = ["ENROLLMENT", "RENEWAL", "ADJUSTMENT"];

function toNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function round2(value) {
  return Number(toNumber(value).toFixed(2));
}

function startOfDay(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function toMonthLabel(year, month) {
  const date = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function computeOldestOverdueDays(dues, asOf = new Date()) {
  const overdueDates = (dues || [])
    .filter((due) => String(due.status || "").toUpperCase() === "OVERDUE" && round2(due.pending) > 0)
    .map((due) => toDate(due.dueDate))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());

  if (!overdueDates.length) {
    return 0;
  }

  const oldest = overdueDates[0];
  const now = startOfDay(asOf);
  const diffMs = now.getTime() - startOfDay(oldest).getTime();
  return diffMs > 0 ? Math.floor(diffMs / (24 * 60 * 60 * 1000)) : 0;
}

function getNextDue(dues = []) {
  return [...dues]
    .filter((due) => round2(due.pending) > 0 && !["WAIVED", "PAUSED"].includes(String(due.status || "").toUpperCase()))
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] || null;
}

function getLatestPaymentFromTransactions(transactions = []) {
  const latest = [...transactions]
    .sort((a, b) => {
      const aAt = toDate(a.receivedAt || a.createdAt)?.getTime() || 0;
      const bAt = toDate(b.receivedAt || b.createdAt)?.getTime() || 0;
      return bAt - aAt;
    })[0];

  if (!latest) {
    return null;
  }

  return {
    amount: round2(latest.grossAmount),
    paidAt: latest.receivedAt || latest.createdAt,
    mode: latest.paymentMode || null,
    type: latest.type || null,
    receiptId: latest.receiptId || null
  };
}

function resolveFinancialStatus({ summary = {}, latestPayment = null }) {
  const totalPending = round2(summary.totalPending);
  const totalOverdue = round2(summary.totalOverdue);
  const rawStatus = String(summary.status || "").trim().toUpperCase();

  if (rawStatus) {
    return rawStatus;
  }

  if (totalOverdue > 0) {
    return "OVERDUE";
  }

  if (totalPending > 0) {
    return "PENDING";
  }

  if (latestPayment?.amount && round2(latestPayment.amount) > 0) {
    return "PAID";
  }

  return "NOT_STARTED";
}

function buildRiskLevel({ totalPending, totalOverdue, oldestOverdueDays }) {
  if (totalOverdue > 0 && oldestOverdueDays >= 30) {
    return "HIGH";
  }

  if (totalOverdue > 0 || totalPending >= 2000) {
    return "MEDIUM";
  }

  if (totalPending > 0) {
    return "LOW";
  }

  return "NONE";
}

function buildFeeReminderCards({ timeline, asOf = new Date() }) {
  const dues = Array.isArray(timeline?.dues) ? timeline.dues : [];
  const summary = timeline?.summary || {};
  const overdueRows = dues.filter((due) => String(due.status || "").toUpperCase() === "OVERDUE" && round2(due.pending) > 0);
  const pendingRows = dues.filter((due) => ["PENDING", "OVERDUE", "PARTIAL"].includes(String(due.status || "").toUpperCase()) && round2(due.pending) > 0);
  const waivedRows = dues.filter((due) => String(due.status || "").toUpperCase() === "WAIVED");
  const nextDue = getNextDue(dues);
  const cards = [];

  if (nextDue && round2(nextDue.pending) > 0) {
    const monthLabel = toMonthLabel(nextDue.year, nextDue.month);
    cards.push({
      id: `pending-${nextDue.year}-${nextDue.month}`,
      kind: "PENDING_MONTH",
      severity: "warning",
      title: `Your ${monthLabel} fee is pending`,
      message: `Pending amount: Rs ${round2(nextDue.pending).toLocaleString("en-IN")}`,
      dismissKey: `pending-${nextDue.year}-${nextDue.month}`,
      reappearToken: `${nextDue.year}-${nextDue.month}-${round2(nextDue.pending)}`,
      monthKey: `${nextDue.year}-${nextDue.month}`,
      dueDate: nextDue.dueDate
    });
  }

  if (pendingRows.length >= 2) {
    cards.push({
      id: `months-pending-${pendingRows.length}`,
      kind: "MULTI_MONTH_PENDING",
      severity: "warning",
      title: `${pendingRows.length} months pending`,
      message: `Total pending: Rs ${round2(summary.totalPending).toLocaleString("en-IN")}`,
      dismissKey: "multi-month-pending",
      reappearToken: `${pendingRows.length}-${round2(summary.totalPending)}`,
      monthKey: null,
      dueDate: null
    });
  }

  if (overdueRows.length) {
    const oldestDays = computeOldestOverdueDays(dues, asOf);
    cards.push({
      id: `overdue-${overdueRows.length}`,
      kind: "OVERDUE",
      severity: "critical",
      title: `Fee overdue by ${oldestDays} days`,
      message: `${overdueRows.length} due item(s) are overdue.`,
      dismissKey: "overdue",
      reappearToken: `${overdueRows.length}-${round2(summary.totalOverdue)}-${oldestDays}`,
      monthKey: null,
      dueDate: overdueRows[0]?.dueDate || null
    });
  }

  const latestWaived = waivedRows
    .sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime())[0];
  if (latestWaived) {
    cards.push({
      id: `waived-${latestWaived.year}-${latestWaived.month}`,
      kind: "WAIVED",
      severity: "info",
      title: `Waived for ${toMonthLabel(latestWaived.year, latestWaived.month)}`,
      message: latestWaived.adjustmentRemarks || "This month is marked as waived.",
      dismissKey: `waived-${latestWaived.year}-${latestWaived.month}`,
      reappearToken: `${latestWaived.year}-${latestWaived.month}`,
      monthKey: `${latestWaived.year}-${latestWaived.month}`,
      dueDate: latestWaived.dueDate
    });
  }

  return cards;
}

async function listTeacherStudentFinancialRows({ tenantId, teacherUserId, hierarchyNodeId, limit = 25, offset = 0, tx = prisma }) {
  const batchAssignments = await tx.batchTeacherAssignment.findMany({
    where: {
      tenantId,
      teacherUserId
    },
    select: {
      batchId: true
    }
  });

  const batchIds = Array.from(new Set(batchAssignments.map((row) => String(row.batchId)).filter(Boolean)));
  const teacherScopeFilters = [{ assignedTeacherUserId: teacherUserId }];
  if (batchIds.length) {
    teacherScopeFilters.push({ batchId: { in: batchIds } });
  }

  const primaryWhere = {
    tenantId,
    hierarchyNodeId,
    status: "ACTIVE",
    OR: teacherScopeFilters
  };

  let effectiveWhere = primaryWhere;
  let totalDistinctRows = await tx.enrollment.groupBy({
    by: ["studentId"],
    where: effectiveWhere
  });

  if (!totalDistinctRows.length) {
    const fallbackScopeFilters = [
      ...teacherScopeFilters,
      { student: { currentTeacherUserId: teacherUserId } }
    ];

    const fallbackWhere = {
      tenantId,
      hierarchyNodeId,
      OR: fallbackScopeFilters
    };

    totalDistinctRows = await tx.enrollment.groupBy({
      by: ["studentId"],
      where: fallbackWhere
    });

    if (totalDistinctRows.length) {
      effectiveWhere = fallbackWhere;
      logger.warn("teacher_financial_scope_fallback_applied", {
        tenantId,
        hierarchyNodeId,
        teacherUserId,
        fallbackReason: "NO_ACTIVE_ENROLLMENT_SCOPE_MATCH",
        totalDistinctStudents: totalDistinctRows.length
      });
    }
  }

  const enrollments = await tx.enrollment.findMany({
    where: effectiveWhere,
    distinct: ["studentId"],
    orderBy: [{ student: { admissionNo: "asc" } }, { studentId: "asc" }],
    skip: Math.max(0, Number(offset) || 0),
    take: Math.max(1, Math.min(Number(limit) || 25, 200)),
    select: {
      studentId: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          guardianName: true,
          isActive: true
        }
      }
    }
  });

  const studentIds = enrollments.map((row) => String(row.studentId));
  if (!studentIds.length) {
    return { total: totalDistinctRows.length, items: [] };
  }

  const [timelinesByStudent, transactions] = await Promise.all([
    computeFeeTimelinesForStudents({ tenantId, studentIds, tx }),
    tx.financialTransaction.findMany({
      where: {
        tenantId,
        studentId: { in: studentIds },
        type: { in: CASH_TYPES }
      },
      orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
      select: {
        studentId: true,
        grossAmount: true,
        paymentMode: true,
        type: true,
        receivedAt: true,
        createdAt: true
      }
    })
  ]);

  const txByStudent = new Map();
  for (const row of transactions) {
    const key = String(row.studentId);
    if (!txByStudent.has(key)) txByStudent.set(key, []);
    txByStudent.get(key).push(row);
  }

  const items = enrollments.map((row) => {
    const studentId = String(row.studentId);
    const timeline = timelinesByStudent.get(studentId) || { dues: [], summary: {} };
    const summary = timeline.summary || {};
    const nextDue = getNextDue(timeline.dues || []);
    const latestPayment = getLatestPaymentFromTransactions(txByStudent.get(studentId) || []);
    const oldestOverdueDays = computeOldestOverdueDays(timeline.dues || []);

    return {
      studentId,
      admissionNo: row.student?.admissionNo || null,
      studentName: [row.student?.firstName, row.student?.lastName].filter(Boolean).join(" ").trim() || row.student?.admissionNo || studentId,
      guardianName: row.student?.guardianName || null,
      totals: {
        totalPending: round2(summary.totalPending),
        totalOverdue: round2(summary.totalOverdue),
        waivedMonths: Number(summary.waivedMonths || 0),
        pausedMonths: Number(summary.pausedMonths || 0),
        status: resolveFinancialStatus({ summary, latestPayment })
      },
      latestPayment,
      nextDue: nextDue
        ? {
            amount: round2(nextDue.pending),
            dueDate: nextDue.dueDate,
            month: nextDue.month,
            year: nextDue.year,
            monthLabel: toMonthLabel(nextDue.year, nextDue.month)
          }
        : null,
      overdue: {
        dueCount: (timeline.dues || []).filter((due) => String(due.status || "").toUpperCase() === "OVERDUE" && round2(due.pending) > 0).length,
        oldestDays: oldestOverdueDays
      },
      riskLevel: buildRiskLevel({
        totalPending: round2(summary.totalPending),
        totalOverdue: round2(summary.totalOverdue),
        oldestOverdueDays
      })
    };
  });

  return {
    total: totalDistinctRows.length,
    items
  };
}

function buildTeacherFinancialWidgets(items = []) {
  const pendingFeeStudents = items.filter((item) => round2(item.totals?.totalPending) > 0).length;
  const overdueStudents = items.filter((item) => round2(item.totals?.totalOverdue) > 0).length;
  const highRiskStudents = items.filter((item) => item.riskLevel === "HIGH").length;
  const pendingAmount = round2(items.reduce((sum, item) => sum + round2(item.totals?.totalPending), 0));

  return {
    pendingFeeStudents,
    overdueStudents,
    highRiskStudents,
    pendingAmount,
    collectionRisk: highRiskStudents > 0 ? "HIGH" : overdueStudents > 0 ? "MEDIUM" : pendingFeeStudents > 0 ? "LOW" : "NONE"
  };
}

async function getTeacherFinancialVisibility({ tenantId, teacherUserId, hierarchyNodeId, limit = 25, offset = 0, tx = prisma }) {
  const { total, items } = await listTeacherStudentFinancialRows({
    tenantId,
    teacherUserId,
    hierarchyNodeId,
    limit,
    offset,
    tx
  });

  const widgets = buildTeacherFinancialWidgets(items);
  const alerts = [];

  if (widgets.overdueStudents > 0) {
    alerts.push({
      id: "teacher-overdue",
      severity: widgets.highRiskStudents > 0 ? "critical" : "warning",
      title: `${widgets.overdueStudents} student(s) have overdue fees`,
      message: `Total pending at risk: Rs ${widgets.pendingAmount.toLocaleString("en-IN")}`
    });
  }

  if (!alerts.length && widgets.pendingFeeStudents > 0) {
    alerts.push({
      id: "teacher-pending",
      severity: "info",
      title: `${widgets.pendingFeeStudents} student(s) have pending fees`,
      message: "Review upcoming dues and follow up early."
    });
  }

  return {
    data: {
      widgets,
      alerts,
      items,
      total,
      limit: Math.max(1, Math.min(Number(limit) || 25, 200)),
      offset: Math.max(0, Number(offset) || 0)
    }
  };
}

async function getStudentRecipients({ tenantId, studentId, tx = prisma }) {
  const [studentUsers, parentLinks] = await Promise.all([
    tx.authUser.findMany({
      where: {
        tenantId,
        studentId,
        role: "STUDENT",
        isActive: true
      },
      select: { id: true },
      take: 1
    }),
    tx.parentStudentLink.findMany({
      where: {
        tenantId,
        studentId,
        isActive: true,
        parentUser: {
          is: {
            tenantId,
            role: "PARENT",
            isActive: true
          }
        }
      },
      select: {
        parentUserId: true
      }
    })
  ]);

  const recipientSet = new Set();
  for (const user of studentUsers) recipientSet.add(String(user.id));
  for (const link of parentLinks) recipientSet.add(String(link.parentUserId));

  return Array.from(recipientSet);
}

async function shouldCreateNotification({ tenantId, recipientUserId, type, entityId, tx = prisma }) {
  const threshold = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const existing = await tx.notification.findFirst({
    where: {
      tenantId,
      recipientUserId,
      type,
      entityId: entityId || undefined,
      createdAt: { gte: threshold }
    },
    select: { id: true }
  });

  return !existing;
}

async function syncStudentFinancialNotifications({ tenantId, studentId, timeline, receipts = [], tx = prisma }) {
  const recipients = await getStudentRecipients({ tenantId, studentId, tx });
  if (!recipients.length) {
    return;
  }

  const reminders = buildFeeReminderCards({ timeline, asOf: new Date() });
  const receiptList = Array.isArray(receipts) ? receipts : [];
  const latestReceipt = receiptList[0] || null;

  const refund = await tx.refundTransaction.findFirst({
    where: {
      tenantId,
      studentId
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      amount: true,
      reason: true,
      createdAt: true
    }
  });

  const monthWaiver = await tx.studentFeeMonthAdjustment.findFirst({
    where: {
      tenantId,
      studentId,
      adjustmentType: "WAIVED"
    },
    orderBy: [{ createdAt: "desc" }],
    select: {
      year: true,
      month: true,
      remarks: true,
      createdAt: true
    }
  });

  for (const recipientUserId of recipients) {
    for (const reminder of reminders) {
      const type = reminder.kind === "OVERDUE" ? "FEE_OVERDUE_REMINDER" : "FEE_PENDING_REMINDER";
      const canCreate = await shouldCreateNotification({
        tenantId,
        recipientUserId,
        type,
        entityId: String(studentId),
        tx
      });

      if (!canCreate) continue;

      // Notification records remain additive and immutable for audit safety.
      await createNotification({
        tenantId,
        recipientUserId,
        type,
        category: "FINANCE",
        priority: reminder.severity === "critical" ? "HIGH" : "NORMAL",
        title: reminder.title,
        message: reminder.message,
        entityType: "STUDENT",
        entityId: String(studentId)
      }, tx);
    }

    if (latestReceipt) {
      const paidAt = toDate(latestReceipt.collectedAt || latestReceipt.createdAt);
      if (paidAt && Date.now() - paidAt.getTime() <= 24 * 60 * 60 * 1000) {
        const type = "FEE_PAYMENT_SUCCESS";
        const canCreate = await shouldCreateNotification({ tenantId, recipientUserId, type, entityId: String(studentId), tx });
        if (canCreate) {
          await createNotification({
            tenantId,
            recipientUserId,
            type,
            category: "FINANCE",
            priority: "NORMAL",
            title: "Payment received",
            message: `Payment of Rs ${round2(latestReceipt.totalAmount).toLocaleString("en-IN")} recorded successfully.`,
            entityType: "STUDENT",
            entityId: String(studentId)
          }, tx);
        }
      }
    }

    if (refund) {
      const refundAt = toDate(refund.createdAt);
      if (refundAt && Date.now() - refundAt.getTime() <= 24 * 60 * 60 * 1000) {
        const type = "FEE_REFUND_NOTICE";
        const canCreate = await shouldCreateNotification({ tenantId, recipientUserId, type, entityId: String(studentId), tx });
        if (canCreate) {
          await createNotification({
            tenantId,
            recipientUserId,
            type,
            category: "FINANCE",
            priority: "NORMAL",
            title: "Refund processed",
            message: `Refund of Rs ${round2(refund.amount).toLocaleString("en-IN")} has been processed.`,
            entityType: "STUDENT",
            entityId: String(studentId)
          }, tx);
        }
      }
    }

    if (monthWaiver) {
      const waivedAt = toDate(monthWaiver.createdAt);
      if (waivedAt && Date.now() - waivedAt.getTime() <= 24 * 60 * 60 * 1000) {
        const type = "FEE_WAIVER_NOTICE";
        const canCreate = await shouldCreateNotification({ tenantId, recipientUserId, type, entityId: String(studentId), tx });
        if (canCreate) {
          await createNotification({
            tenantId,
            recipientUserId,
            type,
            category: "FINANCE",
            priority: "NORMAL",
            title: "Waiver applied",
            message: `${toMonthLabel(monthWaiver.year, monthWaiver.month)} has been marked as waived.`,
            entityType: "STUDENT",
            entityId: String(studentId)
          }, tx);
        }
      }
    }
  }
}

async function getStudentFinancialVisibility({ tenantId, studentId, tx = prisma }) {
  const timeline = await computeStudentFeeTimeline({ tenantId, studentId, tx, asOf: new Date() });

  let receipts = [];
  try {
    receipts = await tx.paymentReceipt.findMany({
      where: {
        tenantId,
        studentId
      },
      orderBy: [{ collectedAt: "desc" }, { createdAt: "desc" }],
      take: 20,
      select: {
        id: true,
        receiptNumber: true,
        status: true,
        totalAmount: true,
        collectedAt: true,
        createdAt: true,
        paymentMode: true,
        paymentTransactions: {
          select: {
            financialTransactionId: true
          },
          take: 1
        }
      }
    });
  } catch (error) {
    const code = String(error?.code || "").toUpperCase();
    if (!["P2021", "P2022"].includes(code)) {
      throw error;
    }
  }

  const reminders = buildFeeReminderCards({ timeline, asOf: new Date() });
  const nextDue = getNextDue(timeline.dues || []);
  const upcomingDues = (timeline.dues || [])
    .filter((due) => ["PENDING", "PARTIAL"].includes(String(due.status || "").toUpperCase()) && round2(due.pending) > 0)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .slice(0, 6)
    .map((due) => ({
      id: due.id,
      dueDate: due.dueDate,
      month: due.month,
      year: due.year,
      monthLabel: toMonthLabel(due.year, due.month),
      pending: round2(due.pending),
      status: due.status
    }));

  await syncStudentFinancialNotifications({ tenantId, studentId, timeline, receipts, tx });

  return {
    data: {
      summary: {
        totalPending: round2(timeline.summary?.totalPending),
        totalOverdue: round2(timeline.summary?.totalOverdue),
        totalPaid: round2(timeline.summary?.totalPaid),
        waivedMonths: Number(timeline.summary?.waivedMonths || 0),
        pausedMonths: Number(timeline.summary?.pausedMonths || 0),
        status: timeline.summary?.status || null,
        nextDue: nextDue
          ? {
              amount: round2(nextDue.pending),
              dueDate: nextDue.dueDate,
              monthLabel: toMonthLabel(nextDue.year, nextDue.month)
            }
          : null
      },
      reminders,
      upcomingDues,
      timeline: (timeline.dues || []).slice(-24),
      latestPayment: receipts[0]
        ? {
            receiptId: receipts[0].id,
            receiptNumber: receipts[0].receiptNumber,
            amount: round2(receipts[0].totalAmount),
            status: receipts[0].status,
            paidAt: receipts[0].collectedAt || receipts[0].createdAt,
            mode: receipts[0].paymentMode || null
          }
        : null,
      receipts: receipts.map((receipt) => ({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        status: receipt.status,
        amount: round2(receipt.totalAmount),
        collectedAt: receipt.collectedAt || receipt.createdAt,
        mode: receipt.paymentMode || null
      }))
    }
  };
}

async function getParentFinancialVisibility({ tenantId, authUserId, studentId, tx = prisma }) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const linkedStudentIds = scope.linkedStudents.map((row) => String(row.studentId));
  const timelinesByStudent = await computeFeeTimelinesForStudents({
    tenantId,
    studentIds: linkedStudentIds,
    tx,
    asOf: new Date()
  });

  const childSummaries = scope.linkedStudents.map((linked) => {
    const timeline = timelinesByStudent.get(String(linked.studentId)) || { dues: [], summary: {} };
    const reminders = buildFeeReminderCards({ timeline, asOf: new Date() });
    const nextDue = getNextDue(timeline.dues || []);

    return {
      studentId: linked.studentId,
      studentName: linked.studentName,
      admissionNo: linked.studentCode,
      totalPending: round2(timeline.summary?.totalPending),
      totalOverdue: round2(timeline.summary?.totalOverdue),
      status: timeline.summary?.status || null,
      reminders,
      nextDue: nextDue
        ? {
            amount: round2(nextDue.pending),
            dueDate: nextDue.dueDate,
            monthLabel: toMonthLabel(nextDue.year, nextDue.month)
          }
        : null
    };
  });

  const selectedStudentId = scope.selectedStudent.studentId;
  const selectedTimeline = timelinesByStudent.get(String(selectedStudentId)) || { dues: [], summary: {} };
  const selectedReminders = buildFeeReminderCards({ timeline: selectedTimeline, asOf: new Date() });

  const householdSummary = {
    totalPending: round2(childSummaries.reduce((sum, row) => sum + round2(row.totalPending), 0)),
    totalOverdue: round2(childSummaries.reduce((sum, row) => sum + round2(row.totalOverdue), 0)),
    studentsWithPending: childSummaries.filter((row) => round2(row.totalPending) > 0).length,
    studentsWithOverdue: childSummaries.filter((row) => round2(row.totalOverdue) > 0).length
  };

  return {
    data: {
      selectedStudentId,
      selectedStudent: scope.selectedStudent,
      householdSummary,
      childSummaries,
      reminders: selectedReminders
    }
  };
}

export {
  buildFeeReminderCards,
  buildTeacherFinancialWidgets,
  listTeacherStudentFinancialRows,
  getTeacherFinancialVisibility,
  getStudentFinancialVisibility,
  getParentFinancialVisibility
};
