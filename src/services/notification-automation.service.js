import { prisma } from "../lib/prisma.js";
import { getCenterHealthScore, getAttendanceAnomalies, getTeacherWorkload } from "./leadership-intel.service.js";
import { computeFeeTimelinesForStudents } from "./student-fee-due.service.js";

/**
 * Notification Automation Engine
 * Runs rule-based checks and generates notifications for:
 * - Student risk alerts (AT_RISK students → teacher + center)
 * - Fee overdue alerts (overdue fees → center + franchise)
 * - Attendance drops (anomaly detection → center)
 * - Stale batches (no sessions in 7d → teacher + center)
 * - Health score drops (center grade D/F → franchise + SA)
 * - Teacher overload (OVERLOADED teachers → center)
 * - Fee upcoming reminders (due within 7d → student)
 */

const DUPLICATE_WINDOW_HOURS = 24;

function getCenterNodeId(center) {
  return center?.authUser?.hierarchyNodeId || null;
}

function getCenterName(center) {
  return center?.displayName || center?.name || center?.code || "Unknown center";
}

function getStudentName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(" ") || student?.admissionNo || "Student";
}

function toSafeNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "bigint") return Number(value);
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function roundMoney(value) {
  return Number(toSafeNumber(value).toFixed(2));
}

function startOfDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(value, days) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function computeTimelinesByStudentChunked({ tenantId, studentIds, asOf }) {
  const ids = Array.from(new Set((studentIds || []).map((id) => String(id).trim()).filter(Boolean)));
  const result = new Map();

  if (!ids.length) {
    return result;
  }

  for (const chunk of chunkArray(ids, 200)) {
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

async function isDuplicate(tenantId, recipientUserId, type, entityId) {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_HOURS * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      tenantId,
      recipientUserId,
      type,
      ...(entityId ? { entityId } : {}),
      createdAt: { gte: since }
    },
    select: { id: true }
  });
  return !!existing;
}

async function isPreferenceDisabled(tenantId, userId, type) {
  try {
    const pref = await prisma.notificationPreference.findUnique({
      where: { tenantId_userId_type: { tenantId, userId, type } },
      select: { enabled: true }
    });
    return pref?.enabled === false;
  } catch {
    return false;
  }
}

async function createAutoNotification(payload) {
  if (await isDuplicate(payload.tenantId, payload.recipientUserId, payload.type, payload.entityId)) {
    return null;
  }
  if (await isPreferenceDisabled(payload.tenantId, payload.recipientUserId, payload.type)) {
    return null;
  }
  try {
    return await prisma.notification.create({
      data: {
        tenantId: payload.tenantId,
        recipientUserId: payload.recipientUserId,
        type: payload.type,
        priority: payload.priority || "NORMAL",
        category: payload.category || "SYSTEM",
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null,
        actionUrl: payload.actionUrl || null,
        expiresAt: payload.expiresAt || null
      }
    });
  } catch {
    return null;
  }
}

async function createBulkAutoNotifications(payloads) {
  const filtered = [];
  for (const p of payloads) {
    const dup = await isDuplicate(p.tenantId, p.recipientUserId, p.type, p.entityId);
    if (dup) continue;
    const disabled = await isPreferenceDisabled(p.tenantId, p.recipientUserId, p.type);
    if (disabled) continue;
    filtered.push({
      tenantId: p.tenantId,
      recipientUserId: p.recipientUserId,
      type: p.type,
      priority: p.priority || "NORMAL",
      category: p.category || "SYSTEM",
      title: p.title,
      message: p.message,
      entityType: p.entityType || null,
      entityId: p.entityId || null,
      actionUrl: p.actionUrl || null,
      expiresAt: p.expiresAt || null
    });
  }
  if (!filtered.length) return { count: 0 };
  try {
    return await prisma.notification.createMany({ data: filtered });
  } catch {
    return { count: 0 };
  }
}

// ── Rule: Student Risk Alerts ──
// Finds AT_RISK students and notifies their teacher + center admin
async function runRiskAlertRule(tenantId) {
  const generated = [];

  const centers = await prisma.centerProfile.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: { select: { hierarchyNodeId: true } }
    }
  });

  for (const center of centers) {
    const centerNodeId = getCenterNodeId(center);
    if (!centerNodeId) {
      continue;
    }

    const enrollments = await prisma.enrollment.findMany({
      where: {
        tenantId,
        status: "ACTIVE",
        hierarchyNodeId: centerNodeId
      },
      select: {
        studentId: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            currentTeacherUserId: true
          }
        },
        batch: {
          select: {
            name: true,
            teacherAssignments: { select: { teacherUserId: true } }
          }
        }
      },
      distinct: ["studentId"]
    });

    for (const enr of enrollments) {
      // Check recent worksheets for poor performance signals
      const recentWorksheets = await prisma.worksheetSubmission.findMany({
        where: {
          tenantId,
          studentId: enr.studentId,
          submittedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          score: { not: null }
        },
        select: { score: true },
        orderBy: { submittedAt: "desc" },
        take: 5
      });

      if (recentWorksheets.length < 3) continue;
      const avgAccuracy = recentWorksheets.reduce((sum, worksheet) => sum + Number(worksheet.score || 0), 0) / recentWorksheets.length;
      if (avgAccuracy >= 60) continue; // Not at risk

      const teacherIds = new Set([
        enr.student?.currentTeacherUserId,
        ...(enr.batch?.teacherAssignments || []).map((assignment) => assignment.teacherUserId)
      ].filter(Boolean));

      // Notify teachers of this student
      for (const teacherUserId of teacherIds) {
        generated.push({
          tenantId,
          recipientUserId: teacherUserId,
          type: "RISK_ALERT",
          priority: avgAccuracy < 40 ? "HIGH" : "NORMAL",
          category: "RISK",
          title: "Student At Risk",
          message: `${getStudentName(enr.student)} has avg accuracy of ${Math.round(avgAccuracy)}% over last ${recentWorksheets.length} worksheets in ${enr.batch?.name || "the assigned batch"}.`,
          entityType: "STUDENT",
          entityId: enr.studentId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
      }

      // Notify center admins
      const centerAdmins = await prisma.authUser.findMany({
        where: { tenantId, hierarchyNodeId: centerNodeId, role: "CENTER", isActive: true },
        select: { id: true }
      });
      for (const admin of centerAdmins) {
        generated.push({
          tenantId,
          recipientUserId: admin.id,
          type: "RISK_ALERT",
          priority: avgAccuracy < 40 ? "HIGH" : "NORMAL",
          category: "RISK",
          title: "Student At Risk",
          message: `${getStudentName(enr.student)} at ${getCenterName(center)} has avg accuracy of ${Math.round(avgAccuracy)}%.`,
          entityType: "STUDENT",
          entityId: enr.studentId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
      }
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Fee Overdue Alerts ──
// Finds overdue fee installments and notifies center + franchise
async function runFeeOverdueRule(tenantId) {
  const generated = [];

  const centers = await prisma.centerProfile.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: {
        select: {
          hierarchyNodeId: true
        }
      }
    }
  });

  for (const center of centers) {
    const centerNodeId = getCenterNodeId(center);
    if (!centerNodeId) {
      continue;
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId,
        hierarchyNodeId: centerNodeId,
        isActive: true
      },
      select: {
        id: true
      }
    });

    const studentIds = students.map((row) => String(row.id));
    if (!studentIds.length) {
      continue;
    }

    const timelinesByStudent = await computeTimelinesByStudentChunked({
      tenantId,
      studentIds,
      asOf: new Date()
    });

    let totalOverdueAmount = 0;
    let overdueDueCount = 0;
    let oldestOverdueDate = null;

    for (const timeline of timelinesByStudent.values()) {
      for (const due of timeline.dues || []) {
        if (String(due.status || "").toUpperCase() !== "OVERDUE") continue;

        const pending = roundMoney(due.pending);
        if (pending <= 0) continue;

        totalOverdueAmount = roundMoney(totalOverdueAmount + pending);
        overdueDueCount += 1;

        const dueDate = due.dueDate instanceof Date ? due.dueDate : new Date(due.dueDate);
        if (!oldestOverdueDate || dueDate.getTime() < oldestOverdueDate.getTime()) {
          oldestOverdueDate = dueDate;
        }
      }
    }

    if (totalOverdueAmount <= 0 || overdueDueCount <= 0) {
      continue;
    }

    const centerAdmins = await prisma.authUser.findMany({
      where: { tenantId, hierarchyNodeId: centerNodeId, role: "CENTER", isActive: true },
      select: { id: true }
    });

    const centerNode = await prisma.hierarchyNode.findUnique({
      where: { id: centerNodeId },
      select: { parentId: true }
    });

    const franchiseUsers = centerNode?.parentId
      ? await prisma.authUser.findMany({
          where: {
            tenantId,
            hierarchyNodeId: centerNode.parentId,
            role: { in: ["FRANCHISE", "BP"] },
            isActive: true
          },
          select: { id: true }
        })
      : [];

    const recipients = [...centerAdmins, ...franchiseUsers];
    const centerName = getCenterName(center);
    const oldestDueText = oldestOverdueDate ? oldestOverdueDate.toLocaleDateString() : "N/A";

    for (const recipient of recipients) {
      generated.push({
        tenantId,
        recipientUserId: recipient.id,
        type: "FEE_OVERDUE",
        priority: totalOverdueAmount > 50000 ? "HIGH" : "NORMAL",
        category: "FINANCE",
        title: "Fee Overdue Alert",
        message: `${centerName} has ${overdueDueCount} overdue due item${overdueDueCount > 1 ? "s" : ""} totaling ₹${totalOverdueAmount.toLocaleString("en-IN")}. Oldest due: ${oldestDueText}.`,
        entityType: "FEE_COLLECTION",
        entityId: centerNodeId,
        expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      });
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Fee Upcoming Reminders ──
// Notifies students about fees due within 7 days
async function runFeeUpcomingRule(tenantId) {
  const generated = [];
  const today = startOfDay(new Date());
  const sevenDaysOut = addDays(today, 7);

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      isActive: true,
      authUsers: {
        some: {
          tenantId,
          role: "STUDENT",
          isActive: true
        }
      }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      authUsers: {
        where: {
          tenantId,
          role: "STUDENT",
          isActive: true
        },
        select: {
          id: true
        },
        take: 1
      }
    }
  });

  const studentIds = students.map((row) => String(row.id));
  const timelinesByStudent = await computeTimelinesByStudentChunked({
    tenantId,
    studentIds,
    asOf: sevenDaysOut
  });

  for (const student of students) {
    const recipientUserId = student.authUsers?.[0]?.id;
    if (!recipientUserId) continue;

    const timeline = timelinesByStudent.get(String(student.id));
    if (!timeline) continue;

    const upcomingRows = (timeline.dues || []).filter((due) => {
      const pending = roundMoney(due.pending);
      if (pending <= 0) return false;

      const dueDate = due.dueDate instanceof Date ? due.dueDate : new Date(due.dueDate);
      return dueDate.getTime() >= today.getTime() && dueDate.getTime() <= sevenDaysOut.getTime();
    });

    if (!upcomingRows.length) continue;

    let nextDueDate = null;
    let totalUpcomingAmount = 0;

    for (const due of upcomingRows) {
      const pending = roundMoney(due.pending);
      totalUpcomingAmount = roundMoney(totalUpcomingAmount + pending);

      const dueDate = due.dueDate instanceof Date ? due.dueDate : new Date(due.dueDate);
      if (!nextDueDate || dueDate.getTime() < nextDueDate.getTime()) {
        nextDueDate = dueDate;
      }
    }

    if (!nextDueDate || totalUpcomingAmount <= 0) continue;

    const diffMs = nextDueDate.getTime() - Date.now();
    const daysLeft = Math.max(0, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

    generated.push({
      tenantId,
      recipientUserId,
      type: "FEE_UPCOMING",
      priority: daysLeft <= 2 ? "HIGH" : "NORMAL",
      category: "FINANCE",
      title: "Fee Due Soon",
      message: `₹${totalUpcomingAmount.toLocaleString("en-IN")} is due in ${daysLeft} day${daysLeft !== 1 ? "s" : ""} across ${upcomingRows.length} installment${upcomingRows.length !== 1 ? "s" : ""}.`,
      entityType: "STUDENT",
      entityId: String(student.id),
      expiresAt: nextDueDate
    });
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Attendance Drop Alerts ──
// Uses anomaly detection from leadership-intel to notify center admins
async function runAttendanceDropRule(tenantId) {
  const generated = [];

  const centers = await prisma.centerProfile.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: { select: { hierarchyNodeId: true } }
    }
  });

  for (const center of centers) {
    const centerNodeId = getCenterNodeId(center);
    if (!centerNodeId) {
      continue;
    }

    try {
      const anomalies = await getAttendanceAnomalies(tenantId, centerNodeId);
      const critical = anomalies.filter(a => a.severity === "CRITICAL");
      if (!critical.length) continue;

      const centerAdmins = await prisma.authUser.findMany({
        where: { tenantId, hierarchyNodeId: centerNodeId, role: "CENTER", isActive: true },
        select: { id: true }
      });

      for (const admin of centerAdmins) {
        generated.push({
          tenantId,
          recipientUserId: admin.id,
          type: "ATTENDANCE_DROP",
          priority: "HIGH",
          category: "OPERATIONS",
          title: "Attendance Anomaly Detected",
          message: `${critical.length} critical attendance issue${critical.length > 1 ? "s" : ""} at ${getCenterName(center)}: ${critical[0].detail || critical[0].description || critical[0].title}`,
          entityType: "CENTER",
          entityId: centerNodeId,
          expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        });
      }
    } catch {
      // Skip center if anomaly detection fails
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Stale Batch Alerts ──
// Batches with no sessions in 7 days → notify teacher
async function runStaleBatchRule(tenantId) {
  const generated = [];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const activeBatches = await prisma.batch.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      teacherAssignments: { select: { teacherUserId: true } },
      attendanceSessions: {
        where: { date: { gte: sevenDaysAgo } },
        select: { id: true },
        take: 1
      }
    }
  });

  const staleBatches = activeBatches.filter((batch) => batch.attendanceSessions.length === 0 && batch.teacherAssignments.length > 0);

  for (const batch of staleBatches) {
    for (const assignment of batch.teacherAssignments) {
      generated.push({
        tenantId,
        recipientUserId: assignment.teacherUserId,
        type: "STALE_BATCH",
        priority: "NORMAL",
        category: "OPERATIONS",
        title: "Batch Needs Attention",
        message: `Batch "${batch.name}" has had no sessions in the last 7 days. Please schedule or log sessions.`,
        entityType: "BATCH",
        entityId: batch.id,
        expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      });
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Health Score Drop Alerts ──
// Centers with grade D or F → notify franchise/BP/SA
async function runHealthScoreDropRule(tenantId) {
  const generated = [];

  const centers = await prisma.centerProfile.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: { select: { hierarchyNodeId: true } }
    }
  });

  for (const center of centers) {
    const centerNodeId = getCenterNodeId(center);
    if (!centerNodeId) {
      continue;
    }

    try {
      const health = await getCenterHealthScore(tenantId, centerNodeId);
      if (!health || !["D", "F"].includes(health.grade)) continue;

      // Find parent franchise/BP nodes by looking up hierarchy
      const node = await prisma.hierarchyNode.findUnique({
        where: { id: centerNodeId },
        select: { parentId: true }
      });

      if (node?.parentId) {
        // Notify all users at parent node (franchise level)
        const franchiseUsers = await prisma.authUser.findMany({
          where: { tenantId, hierarchyNodeId: node.parentId, isActive: true, role: { in: ["FRANCHISE", "BP"] } },
          select: { id: true }
        });

        for (const user of franchiseUsers) {
          generated.push({
            tenantId,
            recipientUserId: user.id,
            type: "HEALTH_SCORE_DROP",
            priority: health.grade === "F" ? "CRITICAL" : "HIGH",
            category: "OPERATIONS",
            title: "Center Health Alert",
            message: `${getCenterName(center)} has health grade ${health.grade} (score: ${health.total}/100). Immediate attention needed.`,
            entityType: "CENTER",
            entityId: centerNodeId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          });
        }
      }

      // Also notify superadmins
      const superadmins = await prisma.authUser.findMany({
        where: { tenantId, role: "SUPERADMIN", isActive: true },
        select: { id: true }
      });
      for (const sa of superadmins) {
        generated.push({
          tenantId,
          recipientUserId: sa.id,
          type: "HEALTH_SCORE_DROP",
          priority: health.grade === "F" ? "CRITICAL" : "HIGH",
          category: "OPERATIONS",
          title: "Center Health Alert",
          message: `${getCenterName(center)} has health grade ${health.grade} (score: ${health.total}/100).`,
          entityType: "CENTER",
          entityId: centerNodeId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
      }
    } catch {
      // Skip center
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Rule: Teacher Overload Alerts ──
// Teachers with OVERLOADED status → notify center admin
async function runTeacherOverloadRule(tenantId) {
  const generated = [];

  const centers = await prisma.centerProfile.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true,
      authUser: { select: { hierarchyNodeId: true } }
    }
  });

  for (const center of centers) {
    const centerNodeId = getCenterNodeId(center);
    if (!centerNodeId) {
      continue;
    }

    try {
      const workload = await getTeacherWorkload(tenantId, centerNodeId);
      const overloaded = workload.filter((teacher) => teacher.load === "OVERLOADED");
      if (!overloaded.length) continue;

      const centerAdmins = await prisma.authUser.findMany({
        where: { tenantId, hierarchyNodeId: centerNodeId, role: "CENTER", isActive: true },
        select: { id: true }
      });

      for (const admin of centerAdmins) {
        generated.push({
          tenantId,
          recipientUserId: admin.id,
          type: "TEACHER_OVERLOAD",
          priority: "HIGH",
          category: "OPERATIONS",
          title: "Teacher Overload Alert",
          message: `${overloaded.length} teacher${overloaded.length > 1 ? "s are" : " is"} overloaded at ${getCenterName(center)}: ${overloaded.map((teacher) => teacher.name).join(", ")}.`,
          entityType: "CENTER",
          entityId: centerNodeId,
          expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        });
      }
    } catch {
      // Skip center
    }
  }

  return createBulkAutoNotifications(generated);
}

// ── Main Automation Runner ──
// Runs all rules for a tenant. Called by SA or scheduled job.
async function runAllAutomationRules(tenantId) {
  const results = {};

  const rules = [
    { name: "riskAlerts", fn: () => runRiskAlertRule(tenantId) },
    { name: "feeOverdue", fn: () => runFeeOverdueRule(tenantId) },
    { name: "feeUpcoming", fn: () => runFeeUpcomingRule(tenantId) },
    { name: "attendanceDrop", fn: () => runAttendanceDropRule(tenantId) },
    { name: "staleBatch", fn: () => runStaleBatchRule(tenantId) },
    { name: "healthScoreDrop", fn: () => runHealthScoreDropRule(tenantId) },
    { name: "teacherOverload", fn: () => runTeacherOverloadRule(tenantId) }
  ];

  for (const rule of rules) {
    try {
      const result = await rule.fn();
      results[rule.name] = { ok: true, count: result?.count || 0 };
    } catch (err) {
      results[rule.name] = { ok: false, error: err.message };
    }
  }

  return results;
}

// ── Cleanup: Remove expired notifications ──
async function cleanupExpiredNotifications(tenantId) {
  const result = await prisma.notification.deleteMany({
    where: {
      tenantId,
      expiresAt: { not: null, lt: new Date() },
      isRead: true
    }
  });
  return { deleted: result.count };
}

// ── Notification Preferences ──
async function getUserPreferences(userId, tenantId) {
  try {
    const prefs = await prisma.notificationPreference.findMany({
      where: { tenantId, userId },
      select: { type: true, enabled: true }
    });
    return prefs;
  } catch {
    return [];
  }
}

async function updateUserPreference(userId, tenantId, type, enabled) {
  return prisma.notificationPreference.upsert({
    where: { tenantId_userId_type: { tenantId, userId, type } },
    create: { tenantId, userId, type, enabled },
    update: { enabled }
  });
}

async function updateUserPreferencesBulk(userId, tenantId, preferences) {
  const results = [];
  for (const { type, enabled } of preferences) {
    const result = await prisma.notificationPreference.upsert({
      where: { tenantId_userId_type: { tenantId, userId, type } },
      create: { tenantId, userId, type, enabled },
      update: { enabled }
    });
    results.push(result);
  }
  return results;
}

export {
  runAllAutomationRules,
  runRiskAlertRule,
  runFeeOverdueRule,
  runFeeUpcomingRule,
  runAttendanceDropRule,
  runStaleBatchRule,
  runHealthScoreDropRule,
  runTeacherOverloadRule,
  cleanupExpiredNotifications,
  getUserPreferences,
  updateUserPreference,
  updateUserPreferencesBulk,
  createAutoNotification
};
