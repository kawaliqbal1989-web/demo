import { prisma } from "../lib/prisma.js";
import { listOperationalNotifications } from "./operational-notification.service.js";
import { getStudentEngagementAnalyticsBundle } from "./student-engagement-analytics.service.js";
import { isStudentEngagementReminder } from "./student-dashboard.service.js";

function createHttpError(statusCode, message, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function safeName(firstName, lastName) {
  return [String(firstName || "").trim(), String(lastName || "").trim()].filter(Boolean).join(" ").trim();
}

async function resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  if (!tenantId || !authUserId) {
    throw createHttpError(401, "Parent authentication is required", "AUTH_REQUIRED");
  }

  const parentUser = await tx.authUser.findFirst({
    where: {
      tenantId,
      id: authUserId,
      role: "PARENT",
      isActive: true
    },
    select: {
      id: true,
      email: true,
      username: true,
      parentStudentLinks: {
        where: {
          tenantId,
          isActive: true,
          student: {
            is: {
              tenantId,
              isActive: true
            }
          }
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: {
          studentId: true,
          relationship: true,
          isPrimary: true,
          visibilityKey: true,
          student: {
            select: {
              id: true,
              admissionNo: true,
              firstName: true,
              lastName: true,
              guardianName: true,
              levelId: true,
              hierarchyNodeId: true,
              level: {
                select: {
                  id: true,
                  name: true,
                  rank: true
                }
              },
              hierarchyNode: {
                select: {
                  id: true,
                  name: true,
                  code: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!parentUser) {
    throw createHttpError(403, "Parent access is not active", "PARENT_SCOPE_REQUIRED");
  }

  const linkedStudents = parentUser.parentStudentLinks.map((link) => ({
    studentId: link.studentId,
    relationship: link.relationship,
    isPrimary: link.isPrimary,
    visibilityKey: link.visibilityKey,
    studentCode: link.student?.admissionNo || null,
    studentName: safeName(link.student?.firstName, link.student?.lastName) || link.student?.admissionNo || null,
    guardianName: link.student?.guardianName || null,
    levelId: link.student?.levelId || null,
    levelName: link.student?.level?.name || null,
    levelRank: link.student?.level?.rank ?? null,
    hierarchyNodeId: link.student?.hierarchyNodeId || null,
    hierarchyNodeName: link.student?.hierarchyNode?.name || null,
    hierarchyNodeCode: link.student?.hierarchyNode?.code || null
  }));

  if (!linkedStudents.length) {
    throw createHttpError(403, "No active linked students found for parent", "PARENT_STUDENT_SCOPE_REQUIRED");
  }

  const selectedStudent = studentId
    ? linkedStudents.find((item) => item.studentId === studentId)
    : linkedStudents.find((item) => item.isPrimary) || linkedStudents[0];

  if (!selectedStudent) {
    throw createHttpError(404, "Requested student is not linked to this parent", "PARENT_STUDENT_NOT_FOUND");
  }

  return {
    tenantId,
    parentUserId: parentUser.id,
    parentIdentity: {
      email: parentUser.email,
      username: parentUser.username,
      displayName: parentUser.username || parentUser.email
    },
    linkedStudents,
    selectedStudent
  };
}

async function listParentDashboardReminders({ tenantId, authUserId, studentId, limit = 10, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const notifications = await listOperationalNotifications({
    tenantId,
    recipientUserId: scope.parentUserId,
    filters: {
      status: ["ACTIVE"],
      limit: Math.max(1, Math.min(Number(limit) || 10, 25)),
      offset: 0
    }
  }, tx);

  const items = notifications.items.filter((item) => isStudentEngagementReminder(item, scope.selectedStudent.studentId));

  return {
    data: {
      selectedStudent: scope.selectedStudent,
      linkedStudents: scope.linkedStudents,
      items,
      total: items.length,
      unreadCount: items.filter((item) => item.isUnread).length
    },
    meta: {
      parent: scope.parentIdentity
    }
  };
}

async function getParentDashboardOverview({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const [selectedBundle, linkedBundles, reminders] = await Promise.all([
    getStudentEngagementAnalyticsBundle({ tenantId, studentId: scope.selectedStudent.studentId, tx }),
    Promise.all(
      scope.linkedStudents.map((linkedStudent) => getStudentEngagementAnalyticsBundle({
        tenantId,
        studentId: linkedStudent.studentId,
        tx
      }))
    ),
    listParentDashboardReminders({ tenantId, authUserId, studentId: scope.selectedStudent.studentId, tx, limit: 6 })
  ]);

  const householdSummary = {
    studentCount: linkedBundles.length,
    averageEngagementScore: linkedBundles.length
      ? Number((linkedBundles.reduce((total, item) => total + Number(item.overview.engagementScore || 0), 0) / linkedBundles.length).toFixed(2))
      : 0,
    atRiskStudents: linkedBundles.filter((item) => item.overview.engagementBand === "AT_RISK").length,
    totalUnreadReminders: reminders.data.unreadCount
  };

  return {
    data: {
      parent: scope.parentIdentity,
      linkedStudents: scope.linkedStudents,
      selectedStudent: scope.selectedStudent,
      householdSummary,
      studentOverview: selectedBundle.overview,
      studentStreaks: selectedBundle.streaks,
      achievementsPreview: selectedBundle.achievements.items.slice(0, 6),
      reminderSummary: {
        total: reminders.data.total,
        unreadCount: reminders.data.unreadCount,
        topItems: reminders.data.items.slice(0, 3)
      }
    },
    meta: selectedBundle.meta
  };
}

async function getParentAttendanceVisibility({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const [bundle, recentAttendance] = await Promise.all([
    getStudentEngagementAnalyticsBundle({ tenantId, studentId: scope.selectedStudent.studentId, tx }),
    tx.attendanceEntry.findMany({
      where: {
        tenantId,
        studentId: scope.selectedStudent.studentId,
        session: {
          status: { in: ["PUBLISHED", "LOCKED"] }
        }
      },
      orderBy: [{ session: { date: "desc" } }],
      take: 12,
      select: {
        status: true,
        markedAt: true,
        session: {
          select: {
            id: true,
            date: true,
            status: true
          }
        }
      }
    })
  ]);

  return {
    data: {
      linkedStudents: scope.linkedStudents,
      selectedStudent: scope.selectedStudent,
      summary: bundle.attendanceTrends.summary,
      trends: bundle.attendanceTrends.items,
      recentAttendance: recentAttendance.map((item) => ({
        status: item.status,
        markedAt: item.markedAt,
        sessionId: item.session?.id || null,
        sessionDate: item.session?.date || null,
        sessionStatus: item.session?.status || null
      }))
    },
    meta: bundle.meta
  };
}

async function getParentWorksheetProgressVisibility({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const [bundle, assignments, recentSubmissions] = await Promise.all([
    getStudentEngagementAnalyticsBundle({ tenantId, studentId: scope.selectedStudent.studentId, tx }),
    tx.worksheetAssignment.findMany({
      where: {
        tenantId,
        studentId: scope.selectedStudent.studentId,
        isActive: true
      },
      orderBy: [{ assignedAt: "desc" }],
      take: 12,
      select: {
        worksheetId: true,
        assignedAt: true,
        dueDate: true,
        worksheet: {
          select: {
            title: true
          }
        }
      }
    }),
    tx.worksheetSubmission.findMany({
      where: {
        tenantId,
        studentId: scope.selectedStudent.studentId,
        finalSubmittedAt: { not: null }
      },
      orderBy: [{ finalSubmittedAt: "desc" }],
      take: 12,
      select: {
        worksheetId: true,
        score: true,
        finalSubmittedAt: true,
        worksheet: {
          select: {
            title: true
          }
        }
      }
    })
  ]);

  const completedWorksheetIds = new Set(recentSubmissions.map((item) => item.worksheetId));

  return {
    data: {
      linkedStudents: scope.linkedStudents,
      selectedStudent: scope.selectedStudent,
      summary: bundle.practiceTrends.summary,
      trends: bundle.practiceTrends.items,
      assignments: assignments.map((item) => ({
        worksheetId: item.worksheetId,
        worksheetTitle: item.worksheet?.title || null,
        assignedAt: item.assignedAt,
        dueDate: item.dueDate,
        status: completedWorksheetIds.has(item.worksheetId) ? "COMPLETED" : "PENDING"
      })),
      recentSubmissions: recentSubmissions.map((item) => ({
        worksheetId: item.worksheetId,
        worksheetTitle: item.worksheet?.title || null,
        score: item.score === null || item.score === undefined ? null : Number(item.score),
        submittedAt: item.finalSubmittedAt
      }))
    },
    meta: bundle.meta
  };
}

async function getParentEngagementVisibility({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const bundle = await getStudentEngagementAnalyticsBundle({
    tenantId,
    studentId: scope.selectedStudent.studentId,
    tx
  });

  return {
    data: {
      linkedStudents: scope.linkedStudents,
      selectedStudent: scope.selectedStudent,
      overview: bundle.overview,
      streaks: bundle.streaks,
      weakTopics: bundle.weakTopics,
      examParticipation: bundle.examParticipation
    },
    meta: bundle.meta
  };
}

async function getParentAchievementVisibility({ tenantId, authUserId, studentId, tx = prisma } = {}) {
  const scope = await resolveParentVisibilityScope({ tenantId, authUserId, studentId, tx });
  const bundle = await getStudentEngagementAnalyticsBundle({
    tenantId,
    studentId: scope.selectedStudent.studentId,
    tx
  });

  return {
    data: {
      linkedStudents: scope.linkedStudents,
      selectedStudent: scope.selectedStudent,
      achievements: bundle.achievements
    },
    meta: bundle.meta
  };
}

export {
  getParentAchievementVisibility,
  getParentAttendanceVisibility,
  getParentDashboardOverview,
  getParentEngagementVisibility,
  getParentWorksheetProgressVisibility,
  listParentDashboardReminders,
  resolveParentVisibilityScope
};