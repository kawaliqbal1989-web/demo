import { prisma } from "../lib/prisma.js";

function toNumber(value) {
  return Number(value || 0);
}

function roundCurrency(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function toPercent(numerator, denominator) {
  if (!denominator) {
    return null;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

function groupCountMap(rows) {
  return new Map(rows.map((row) => [row.hierarchyNodeId, row._count?._all || 0]));
}

function createEmptyDashboardSummary({ generatedAt, franchisesCount = 0 }) {
  return {
    meta: {
      generatedAt,
      windowDays: 30
    },
    overview: {
      franchisesCount,
      centersCount: 0,
      activeCentersCount: 0,
      inactiveCentersCount: 0,
      studentsCount: 0,
      activeStudentsCount: 0,
      activeEnrollments: 0,
      teachersCount: 0,
      activeBatchesCount: 0
    },
    operations: {
      attendanceRate30d: null,
      sessionsFinalized30d: 0,
      recentAdmissions30d: 0,
      teacherCoverageRate: null,
      centersWithoutTeachers: 0,
      batchesWithoutTeachers: 0,
      lowAttendanceCenters: 0
    },
    performance: {
      worksheetSubmissions30d: 0,
      studentsPracticing30d: 0,
      worksheetAverageScore30d: null,
      mockTestAttempts30d: 0,
      mockTestAveragePercentage30d: null,
      activeCompetitionEnrollments: 0,
      levelCompletions30d: 0
    },
    finance: {
      collections30d: 0,
      overdueInstallmentsCount: 0,
      overdueAmount: 0,
      pendingSettlementsCount: 0,
      pendingSettlementAmount: 0
    },
    workflow: {
      pendingCompetitionRequests: 0,
      certificatesIssued30d: 0,
      certificatesRevoked30d: 0
    },
    alerts: [
      {
        id: "no-centers",
        severity: "info",
        title: "No centers in scope",
        detail: "Add or activate centers to populate operational, academic, and finance monitoring."
      }
    ],
    rankings: {
      topCentersByStudents: [],
      lowAttendanceCenters: [],
      collectionLeaders: [],
      attentionCenters: []
    },
    franchiseComparison: []
  };
}

async function safeCertificateCount(args) {
  try {
    return await prisma.certificate.count(args);
  } catch (error) {
    if (error?.code === "P2021" || error?.code === "P2022") {
      return 0;
    }
    throw error;
  }
}

async function buildHierarchyDashboardSummary({
  tenantId,
  centerProfiles,
  settlementsWhere,
  pendingCompetitionWhere,
  franchisesCount = 0
}) {
  const generatedAt = new Date().toISOString();
  const now = new Date();
  const since30 = new Date(now);
  since30.setDate(since30.getDate() - 30);

  const scopedCenters = centerProfiles.filter((center) => center.hierarchyNodeId);
  const centerNodeIds = scopedCenters.map((center) => center.hierarchyNodeId);

  if (!centerNodeIds.length) {
    return createEmptyDashboardSummary({ generatedAt, franchisesCount });
  }

  const [
    studentsByNode,
    activeStudentsByNode,
    recentAdmissionsByNode,
    activeEnrollmentsByNode,
    teachersByNode,
    activeBatches,
    attendanceSessions,
    overdueInstallments,
    recentTransactions,
    pendingCompetitionRequests,
    certificatesIssued30d,
    certificatesRevoked30d,
    activeCompetitionEnrollments,
    worksheetSummary,
    worksheetStudentRows,
    mockTestSummary,
    levelCompletions30d,
    settlements
  ] = await Promise.all([
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds }
      },
      _count: { _all: true }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        isActive: true,
        hierarchyNodeId: { in: centerNodeIds }
      },
      _count: { _all: true }
    }),
    prisma.student.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        createdAt: { gte: since30 }
      },
      _count: { _all: true }
    }),
    prisma.enrollment.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        status: "ACTIVE"
      },
      _count: { _all: true }
    }),
    prisma.authUser.groupBy({
      by: ["hierarchyNodeId"],
      where: {
        tenantId,
        role: "TEACHER",
        isActive: true,
        hierarchyNodeId: { in: centerNodeIds }
      },
      _count: { _all: true }
    }),
    prisma.batch.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        status: "ACTIVE",
        isActive: true
      },
      select: {
        id: true,
        hierarchyNodeId: true,
        teacherAssignments: {
          select: { teacherUserId: true },
          take: 1
        }
      },
      take: 10000
    }),
    prisma.attendanceSession.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: centerNodeIds },
        status: { in: ["PUBLISHED", "LOCKED"] },
        date: { gte: since30 }
      },
      select: {
        hierarchyNodeId: true,
        entries: {
          select: { status: true }
        }
      },
      take: 50000
    }),
    prisma.studentFeeInstallment.findMany({
      where: {
        tenantId,
        dueDate: { lt: now },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      select: {
        amount: true,
        student: {
          select: {
            hierarchyNodeId: true
          }
        },
        payments: {
          select: { grossAmount: true }
        }
      },
      take: 50000
    }),
    prisma.financialTransaction.findMany({
      where: {
        tenantId,
        centerId: { in: centerNodeIds },
        createdAt: { gte: since30 }
      },
      select: {
        centerId: true,
        grossAmount: true
      },
      take: 50000
    }),
    prisma.competition.count({
      where: pendingCompetitionWhere
    }),
    safeCertificateCount({
      where: {
        tenantId,
        status: "ISSUED",
        issuedAt: { gte: since30 },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      }
    }),
    safeCertificateCount({
      where: {
        tenantId,
        status: "REVOKED",
        revokedAt: { gte: since30 },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      }
    }),
    prisma.competitionEnrollment.count({
      where: {
        tenantId,
        isActive: true,
        student: {
          hierarchyNodeId: { in: centerNodeIds }
        }
      }
    }),
    prisma.worksheetSubmission.aggregate({
      where: {
        tenantId,
        submittedAt: { gte: since30 },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        },
        score: { not: null }
      },
      _count: { _all: true },
      _avg: { score: true }
    }),
    prisma.worksheetSubmission.findMany({
      where: {
        tenantId,
        submittedAt: { gte: since30 },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      distinct: ["studentId"],
      select: { studentId: true }
    }),
    prisma.mockTestAttempt.aggregate({
      where: {
        tenantId,
        finalSubmittedAt: { gte: since30 },
        percentage: { not: null },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      },
      _count: { _all: true },
      _avg: { percentage: true }
    }),
    prisma.studentLevelCompletion.count({
      where: {
        tenantId,
        completedAt: { gte: since30 },
        student: {
          is: {
            hierarchyNodeId: { in: centerNodeIds }
          }
        }
      }
    }),
    settlementsWhere ? prisma.settlement.findMany({ where: settlementsWhere }) : Promise.resolve([])
  ]);

  const studentsCountByNode = groupCountMap(studentsByNode);
  const activeStudentsCountByNode = groupCountMap(activeStudentsByNode);
  const recentAdmissionsCountByNode = groupCountMap(recentAdmissionsByNode);
  const enrollmentsCountByNode = groupCountMap(activeEnrollmentsByNode);
  const teachersCountByNode = groupCountMap(teachersByNode);

  const activeBatchesByNode = new Map();
  const batchesWithoutTeachersByNode = new Map();
  for (const batch of activeBatches) {
    const nodeId = batch.hierarchyNodeId;
    activeBatchesByNode.set(nodeId, (activeBatchesByNode.get(nodeId) || 0) + 1);
    if (!batch.teacherAssignments?.length) {
      batchesWithoutTeachersByNode.set(nodeId, (batchesWithoutTeachersByNode.get(nodeId) || 0) + 1);
    }
  }

  const attendanceByNode = new Map();
  for (const session of attendanceSessions) {
    const bucket = attendanceByNode.get(session.hierarchyNodeId) || {
      sessionsFinalized30d: 0,
      attendanceEntries: 0,
      presentLikeEntries: 0
    };
    bucket.sessionsFinalized30d += 1;
    for (const entry of session.entries) {
      bucket.attendanceEntries += 1;
      if (entry.status === "PRESENT" || entry.status === "LATE") {
        bucket.presentLikeEntries += 1;
      }
    }
    attendanceByNode.set(session.hierarchyNodeId, bucket);
  }

  const overdueByNode = new Map();
  for (const installment of overdueInstallments) {
    const nodeId = installment.student?.hierarchyNodeId;
    if (!nodeId) {
      continue;
    }
    const paidAmount = installment.payments.reduce((sum, payment) => sum + toNumber(payment.grossAmount), 0);
    const dueAmount = Math.max(toNumber(installment.amount) - paidAmount, 0);
    if (!dueAmount) {
      continue;
    }
    const bucket = overdueByNode.get(nodeId) || { overdueInstallmentsCount: 0, overdueAmount: 0 };
    bucket.overdueInstallmentsCount += 1;
    bucket.overdueAmount += dueAmount;
    overdueByNode.set(nodeId, bucket);
  }

  const collectionsByNode = new Map();
  for (const transaction of recentTransactions) {
    collectionsByNode.set(
      transaction.centerId,
      roundCurrency((collectionsByNode.get(transaction.centerId) || 0) + toNumber(transaction.grossAmount))
    );
  }

  const centerMetrics = scopedCenters.map((center) => {
    const attendance = attendanceByNode.get(center.hierarchyNodeId) || {
      sessionsFinalized30d: 0,
      attendanceEntries: 0,
      presentLikeEntries: 0
    };
    const attendanceRate30d = toPercent(attendance.presentLikeEntries, attendance.attendanceEntries);
    const teachersCount = Number(teachersCountByNode.get(center.hierarchyNodeId) || 0);
    const activeBatchesCount = Number(activeBatchesByNode.get(center.hierarchyNodeId) || 0);
    const batchesWithoutTeachers = Number(batchesWithoutTeachersByNode.get(center.hierarchyNodeId) || 0);
    const overdue = overdueByNode.get(center.hierarchyNodeId) || {
      overdueInstallmentsCount: 0,
      overdueAmount: 0
    };
    const attentionScore =
      (attendanceRate30d !== null && attendanceRate30d < 75 ? 2 : 0) +
      (batchesWithoutTeachers > 0 ? 2 : 0) +
      (overdue.overdueAmount > 0 ? 1 : 0) +
      (center.status !== "ACTIVE" ? 2 : 0);

    return {
      centerProfileId: center.centerProfileId,
      centerCode: center.code,
      centerName: center.name,
      centerStatus: center.status,
      hierarchyNodeId: center.hierarchyNodeId,
      franchiseProfileId: center.franchiseProfileId || null,
      franchiseCode: center.franchiseCode || null,
      franchiseName: center.franchiseName || null,
      studentsCount: Number(studentsCountByNode.get(center.hierarchyNodeId) || 0),
      activeStudentsCount: Number(activeStudentsCountByNode.get(center.hierarchyNodeId) || 0),
      recentAdmissions30d: Number(recentAdmissionsCountByNode.get(center.hierarchyNodeId) || 0),
      activeEnrollments: Number(enrollmentsCountByNode.get(center.hierarchyNodeId) || 0),
      teachersCount,
      activeBatchesCount,
      batchesWithoutTeachers,
      sessionsFinalized30d: attendance.sessionsFinalized30d,
      attendanceEntries: attendance.attendanceEntries,
      presentLikeEntries: attendance.presentLikeEntries,
      attendanceRate30d,
      overdueInstallmentsCount: overdue.overdueInstallmentsCount,
      overdueAmount: roundCurrency(overdue.overdueAmount),
      collections30d: roundCurrency(collectionsByNode.get(center.hierarchyNodeId) || 0),
      attentionScore
    };
  });

  const overview = {
    franchisesCount,
    centersCount: centerMetrics.length,
    activeCentersCount: centerMetrics.filter((center) => center.centerStatus === "ACTIVE").length,
    inactiveCentersCount: centerMetrics.filter((center) => center.centerStatus !== "ACTIVE").length,
    studentsCount: centerMetrics.reduce((sum, center) => sum + center.studentsCount, 0),
    activeStudentsCount: centerMetrics.reduce((sum, center) => sum + center.activeStudentsCount, 0),
    activeEnrollments: centerMetrics.reduce((sum, center) => sum + center.activeEnrollments, 0),
    teachersCount: centerMetrics.reduce((sum, center) => sum + center.teachersCount, 0),
    activeBatchesCount: centerMetrics.reduce((sum, center) => sum + center.activeBatchesCount, 0)
  };

  const totalAttendanceEntries = centerMetrics.reduce((sum, center) => sum + center.attendanceEntries, 0);
  const totalPresentLikeEntries = centerMetrics.reduce((sum, center) => sum + center.presentLikeEntries, 0);

  const operations = {
    attendanceRate30d: toPercent(totalPresentLikeEntries, totalAttendanceEntries),
    sessionsFinalized30d: centerMetrics.reduce((sum, center) => sum + center.sessionsFinalized30d, 0),
    recentAdmissions30d: centerMetrics.reduce((sum, center) => sum + center.recentAdmissions30d, 0),
    teacherCoverageRate: toPercent(
      centerMetrics.reduce((sum, center) => sum + (center.activeBatchesCount - center.batchesWithoutTeachers), 0),
      overview.activeBatchesCount
    ),
    centersWithoutTeachers: centerMetrics.filter((center) => center.teachersCount === 0).length,
    batchesWithoutTeachers: centerMetrics.reduce((sum, center) => sum + center.batchesWithoutTeachers, 0),
    lowAttendanceCenters: centerMetrics.filter(
      (center) => center.attendanceRate30d !== null && center.attendanceRate30d < 75
    ).length
  };

  const finance = {
    collections30d: roundCurrency(centerMetrics.reduce((sum, center) => sum + center.collections30d, 0)),
    overdueInstallmentsCount: centerMetrics.reduce((sum, center) => sum + center.overdueInstallmentsCount, 0),
    overdueAmount: roundCurrency(centerMetrics.reduce((sum, center) => sum + center.overdueAmount, 0)),
    pendingSettlementsCount: settlements.filter((settlement) => settlement.status === "PENDING").length,
    pendingSettlementAmount: roundCurrency(
      settlements
        .filter((settlement) => settlement.status === "PENDING")
        .reduce((sum, settlement) => sum + toNumber(settlement.partnerEarnings || settlement.grossAmount), 0)
    )
  };

  const performance = {
    worksheetSubmissions30d: worksheetSummary._count?._all || 0,
    studentsPracticing30d: worksheetStudentRows.length,
    worksheetAverageScore30d:
      worksheetSummary._avg?.score !== null && worksheetSummary._avg?.score !== undefined
        ? Math.round(toNumber(worksheetSummary._avg.score) * 10) / 10
        : null,
    mockTestAttempts30d: mockTestSummary._count?._all || 0,
    mockTestAveragePercentage30d:
      mockTestSummary._avg?.percentage !== null && mockTestSummary._avg?.percentage !== undefined
        ? Math.round(toNumber(mockTestSummary._avg.percentage) * 10) / 10
        : null,
    activeCompetitionEnrollments,
    levelCompletions30d
  };

  const workflow = {
    pendingCompetitionRequests,
    certificatesIssued30d,
    certificatesRevoked30d
  };

  const alerts = [];
  if (!overview.centersCount) {
    alerts.push({
      id: "no-centers",
      severity: "warning",
      title: "No centers are mapped",
      detail: "No center hierarchy is available inside this scope yet."
    });
  }
  if (operations.centersWithoutTeachers > 0) {
    alerts.push({
      id: "centers-without-teachers",
      severity: "warning",
      title: `${operations.centersWithoutTeachers} center(s) have no active teacher`,
      detail: "Teacher coverage is incomplete and can block attendance, worksheets, and progression workflows."
    });
  }
  if (operations.batchesWithoutTeachers > 0) {
    alerts.push({
      id: "batches-without-teachers",
      severity: "warning",
      title: `${operations.batchesWithoutTeachers} active batch(es) are unassigned`,
      detail: "Assign teachers to active batches to stabilize attendance and worksheet follow-up."
    });
  }
  if (operations.lowAttendanceCenters > 0) {
    alerts.push({
      id: "low-attendance-centers",
      severity: "critical",
      title: `${operations.lowAttendanceCenters} center(s) are below 75% attendance`,
      detail: "Attendance has dropped below the monitoring threshold in the last 30 days."
    });
  }
  if (finance.overdueInstallmentsCount > 0) {
    alerts.push({
      id: "finance-overdue",
      severity: "critical",
      title: `${finance.overdueInstallmentsCount} overdue installment(s) need follow-up`,
      detail: `Pending overdue amount is ${finance.overdueAmount}.`
    });
  }
  if (workflow.pendingCompetitionRequests > 0) {
    alerts.push({
      id: "competition-workflow",
      severity: "info",
      title: `${workflow.pendingCompetitionRequests} competition request(s) pending`,
      detail: "Workflow backlog needs review to keep approvals and scheduling moving."
    });
  }
  if (performance.worksheetSubmissions30d === 0 && overview.activeStudentsCount > 0) {
    alerts.push({
      id: "no-practice-activity",
      severity: "warning",
      title: "No worksheet activity recorded in the last 30 days",
      detail: "Student practice signals are missing for the monitored period."
    });
  }

  const rankings = {
    topCentersByStudents: centerMetrics
      .slice()
      .sort((a, b) => b.activeStudentsCount - a.activeStudentsCount || a.centerName.localeCompare(b.centerName))
      .slice(0, 5),
    lowAttendanceCenters: centerMetrics
      .filter((center) => center.attendanceRate30d !== null)
      .slice()
      .sort((a, b) => a.attendanceRate30d - b.attendanceRate30d || b.activeStudentsCount - a.activeStudentsCount)
      .slice(0, 5),
    collectionLeaders: centerMetrics
      .slice()
      .sort((a, b) => b.collections30d - a.collections30d || a.centerName.localeCompare(b.centerName))
      .slice(0, 5),
    attentionCenters: centerMetrics
      .filter((center) => center.attentionScore > 0)
      .slice()
      .sort((a, b) => b.attentionScore - a.attentionScore || b.overdueAmount - a.overdueAmount)
      .slice(0, 5)
  };

  const franchiseMap = new Map();
  for (const center of centerMetrics) {
    if (!center.franchiseProfileId) {
      continue;
    }
    const bucket = franchiseMap.get(center.franchiseProfileId) || {
      franchiseProfileId: center.franchiseProfileId,
      franchiseCode: center.franchiseCode,
      franchiseName: center.franchiseName,
      centersCount: 0,
      activeStudentsCount: 0,
      activeEnrollments: 0,
      attendanceEntries: 0,
      presentLikeEntries: 0,
      overdueAmount: 0,
      collections30d: 0,
      attentionScore: 0
    };
    bucket.centersCount += 1;
    bucket.activeStudentsCount += center.activeStudentsCount;
    bucket.activeEnrollments += center.activeEnrollments;
    bucket.attendanceEntries += center.attendanceEntries;
    bucket.presentLikeEntries += center.presentLikeEntries;
    bucket.overdueAmount += center.overdueAmount;
    bucket.collections30d += center.collections30d;
    bucket.attentionScore += center.attentionScore;
    franchiseMap.set(center.franchiseProfileId, bucket);
  }

  const franchiseComparison = Array.from(franchiseMap.values())
    .map((franchise) => ({
      ...franchise,
      attendanceRate30d: toPercent(franchise.presentLikeEntries, franchise.attendanceEntries),
      overdueAmount: roundCurrency(franchise.overdueAmount),
      collections30d: roundCurrency(franchise.collections30d)
    }))
    .sort((a, b) => b.activeStudentsCount - a.activeStudentsCount || a.franchiseName.localeCompare(b.franchiseName));

  return {
    meta: {
      generatedAt,
      windowDays: 30
    },
    overview,
    operations,
    performance,
    finance,
    workflow,
    alerts,
    rankings,
    franchiseComparison
  };
}

export { buildHierarchyDashboardSummary };