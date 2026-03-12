import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

function toSnapshot(submission) {
  if (!submission?.finalSubmittedAt) {
    return null;
  }

  return {
    submissionId: submission.id,
    score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
    correctCount: submission.correctCount ?? null,
    totalQuestions: submission.totalQuestions ?? null,
    completionTimeSeconds: submission.completionTimeSeconds ?? null,
    submittedAt: submission.finalSubmittedAt,
    status: submission.status || null
  };
}

async function main() {
  const approvedRequests = await prisma.worksheetReassignmentRequest.findMany({
    where: {
      status: "APPROVED"
    },
    orderBy: { reviewedAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      studentId: true,
      currentWorksheetId: true,
      reviewedAt: true,
      archivedResultSnapshot: true,
      currentWorksheet: { select: { title: true } }
    }
  });

  const pendingBackfill = approvedRequests.filter((request) => request.archivedResultSnapshot == null);

  let updated = 0;
  let unrecoverable = 0;
  const notes = [];

  for (const request of pendingBackfill) {
    const submission = await prisma.worksheetSubmission.findFirst({
      where: {
        tenantId: request.tenantId,
        studentId: request.studentId,
        worksheetId: request.currentWorksheetId,
        finalSubmittedAt: { not: null }
      },
      select: {
        id: true,
        score: true,
        correctCount: true,
        totalQuestions: true,
        completionTimeSeconds: true,
        finalSubmittedAt: true,
        status: true
      }
    });

    // Only backfill when the surviving submission clearly predates the reassignment approval.
    if (submission?.finalSubmittedAt && request.reviewedAt && new Date(submission.finalSubmittedAt) <= new Date(request.reviewedAt)) {
      await prisma.worksheetReassignmentRequest.update({
        where: { id: request.id },
        data: { archivedResultSnapshot: toSnapshot(submission) }
      });
      updated += 1;
      notes.push({ id: request.id, worksheetTitle: request.currentWorksheet?.title || null, status: "backfilled" });
      continue;
    }

    unrecoverable += 1;
    notes.push({
      id: request.id,
      worksheetTitle: request.currentWorksheet?.title || null,
      status: "unrecoverable",
      reason: submission?.finalSubmittedAt
        ? "Only a post-reassignment submission exists; original result cannot be reconstructed safely."
        : "No surviving submission exists; original result was already deleted."
    });
  }

  console.log(JSON.stringify({
    scanned: pendingBackfill.length,
    updated,
    unrecoverable,
    notes
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });