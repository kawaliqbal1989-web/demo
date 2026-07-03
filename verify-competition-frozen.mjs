import { prisma } from './src/lib/prisma.js';
import { getCompetitionLeaderboard } from './src/services/competition-leaderboard.service.js';

const tenant = await prisma.tenant.findUniqueOrThrow({ where: { code: 'DEFAULT' } });
const superadmin = await prisma.authUser.findFirstOrThrow({ where: { tenantId: tenant.id, role: 'SUPERADMIN' } });
const level = await prisma.level.findFirstOrThrow({ where: { tenantId: tenant.id, rank: 1 } });
const hierarchyNode = await prisma.hierarchyNode.findFirstOrThrow({ where: { tenantId: tenant.id } });

const competition = await prisma.competition.create({
  data: {
    tenantId: tenant.id,
    title: 'verify-frozen-results',
    description: 'verify',
    status: 'SCHEDULED',
    workflowStage: 'APPROVED',
    startsAt: new Date(Date.now() - 3600000),
    endsAt: new Date(Date.now() + 3600000),
    hierarchyNodeId: hierarchyNode.id,
    levelId: level.id,
    createdByUserId: superadmin.id
  }
});

const student = await prisma.student.findFirstOrThrow({
  where: { tenantId: tenant.id, isActive: true },
  orderBy: { createdAt: 'asc' }
});

const worksheet = await prisma.worksheet.create({
  data: {
    tenantId: tenant.id,
    title: 'verify worksheet',
    description: 'verify',
    levelId: level.id,
    createdByUserId: superadmin.id,
    isPublished: true,
    timeLimitSeconds: 600
  }
});

await prisma.$executeRaw`INSERT INTO competitionenrollment (competitionId, studentId, tenantId, levelId, isActive, enrolledAt) VALUES (${competition.id}, ${student.id}, ${tenant.id}, ${level.id}, TRUE, ${new Date()})`;

await prisma.competitionWorksheetAssignment.create({
  data: {
    tenantId: tenant.id,
    competitionId: competition.id,
    worksheetId: worksheet.id,
    studentId: student.id,
    status: 'SUBMITTED',
    startedAt: new Date(Date.now() - 60000),
    submittedAt: new Date(Date.now() - 30000)
  }
});

const submissionResult = await prisma.$executeRaw`INSERT INTO worksheetsubmission (tenantId, worksheetId, studentId, status, finalSubmittedAt, earnedMarks, totalMarks, percentage, correctCount, wrongCount, unansweredCount, totalQuestions, completionTimeSeconds, submittedAt, createdAt, updatedAt) VALUES (${tenant.id}, ${worksheet.id}, ${student.id}, ${'PUBLISHED'}, ${new Date()}, ${100}, ${100}, ${100}, ${10}, ${0}, ${0}, ${10}, ${45}, ${new Date()}, ${new Date()}, ${new Date()})`;
const submission = await prisma.worksheetSubmission.findFirst({ where: { tenantId: tenant.id, worksheetId: worksheet.id, studentId: student.id }, orderBy: { createdAt: 'desc' } });

const leaderboardBefore = await getCompetitionLeaderboard({
  competitionId: competition.id,
  tenantId: tenant.id,
  skipApprovalCheck: true,
  includeAll: true
});

const rankedRows = leaderboardBefore.leaderboard || [];

await prisma.$transaction(async (tx) => {
  await tx.competitionEnrollment.updateMany({
    where: { tenantId: tenant.id, competitionId: competition.id, isActive: true },
    data: { rank: null, totalScore: null }
  });

  await Promise.all(rankedRows.map((row) => tx.competitionEnrollment.updateMany({
    where: {
      tenantId: tenant.id,
      competitionId: competition.id,
      studentId: row.studentId,
      levelId: row.levelId ?? null
    },
    data: {
      rank: row.rank ?? null,
      totalScore: row.score ?? null
    }
  })));
});

await prisma.worksheetSubmission.update({
  where: { id: submission.id },
  data: {
    earnedMarks: 0,
    totalMarks: 100,
    percentage: 0,
    correctCount: 0,
    wrongCount: 10,
    completionTimeSeconds: 120
  }
});

const leaderboardAfter = await getCompetitionLeaderboard({
  competitionId: competition.id,
  tenantId: tenant.id,
  skipApprovalCheck: true,
  includeAll: true
});

const enrollment = await prisma.competitionEnrollment.findUniqueOrThrow({
  where: {
    competitionId_studentId: {
      competitionId: competition.id,
      studentId: student.id
    }
  }
});

console.log(JSON.stringify({ leaderboardAfter, enrollment }, null, 2));
