import { prisma } from "../lib/prisma.js";

function lifecycleError(message, statusCode, errorCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

async function getStudentAndLevels({ tx, tenantId, studentId, targetLevelId }) {
  const student = await tx.student.findFirst({
    where: {
      id: studentId,
      tenantId
    },
    select: {
      id: true,
      levelId: true
    }
  });

  if (!student) {
    throw lifecycleError("Student not found", 404, "STUDENT_NOT_FOUND");
  }

  const [currentLevel, targetLevel] = await Promise.all([
    tx.level.findFirst({
      where: {
        id: student.levelId,
        tenantId
      },
      select: {
        id: true,
        rank: true
      }
    }),
    tx.level.findFirst({
      where: {
        id: targetLevelId,
        tenantId
      },
      select: {
        id: true,
        rank: true
      }
    })
  ]);

  if (!currentLevel) {
    throw lifecycleError("Current level not found", 404, "CURRENT_LEVEL_NOT_FOUND");
  }

  if (!targetLevel) {
    throw lifecycleError("Target level not found", 404, "LEVEL_NOT_FOUND");
  }

  return {
    student,
    currentLevel,
    targetLevel
  };
}

async function evaluatePassThreshold({ tx, tenantId, studentId, levelId }) {
  const rule = await tx.levelRule.findUnique({
    where: {
      tenantId_levelId: {
        tenantId,
        levelId
      }
    },
    select: {
      passThreshold: true
    }
  });

  const threshold = Number(rule?.passThreshold);
  if (!Number.isFinite(threshold)) {
    throw lifecycleError("Pass threshold is not configured for current level", 409, "PASS_THRESHOLD_MISSING");
  }

  const latestSubmission = await tx.worksheetSubmission.findFirst({
    where: {
      tenantId,
      studentId,
      score: {
        not: null
      },
      worksheet: {
        levelId
      }
    },
    orderBy: [
      {
        submittedAt: "desc"
      },
      {
        id: "desc"
      }
    ],
    select: {
      score: true
    }
  });

  const score = Number(latestSubmission?.score ?? Number.NaN);
  const passed = Number.isFinite(score) && score >= threshold;

  return {
    threshold,
    score: Number.isFinite(score) ? Number(score.toFixed(2)) : null,
    passed
  };
}

async function assignLevelWithIntegrity({
  tenantId,
  studentId,
  targetLevelId,
  actorUserId,
  reason = "MANUAL_ASSIGNMENT"
}) {
  return prisma.$transaction(async (tx) => {
    const { student, currentLevel, targetLevel } = await getStudentAndLevels({
      tx,
      tenantId,
      studentId,
      targetLevelId
    });

    if (targetLevel.id === currentLevel.id) {
      return {
        studentId: student.id,
        previousLevelId: currentLevel.id,
        newLevelId: targetLevel.id,
        changed: false
      };
    }

    if (targetLevel.rank <= currentLevel.rank) {
      throw lifecycleError("Level downgrade or lateral reassignment is not allowed", 409, "LEVEL_DOWNGRADE_NOT_ALLOWED");
    }

    if (targetLevel.rank !== currentLevel.rank + 1) {
      throw lifecycleError("Level skip is not allowed", 409, "LEVEL_SKIP_NOT_ALLOWED");
    }

    const passResult = await evaluatePassThreshold({
      tx,
      tenantId,
      studentId,
      levelId: currentLevel.id
    });

    if (!passResult.passed) {
      throw lifecycleError("Student has not passed current level threshold", 409, "PROMOTION_NOT_ELIGIBLE");
    }

    const existingProgression = await tx.studentLevelProgressionHistory.findUnique({
      where: {
        tenantId_studentId_fromLevelId_toLevelId: {
          tenantId,
          studentId,
          fromLevelId: currentLevel.id,
          toLevelId: targetLevel.id
        }
      },
      select: { id: true }
    });

    if (existingProgression) {
      throw lifecycleError("Duplicate promotion attempt detected", 409, "ALREADY_PROMOTED");
    }

    await tx.studentLevelCompletion.upsert({
      where: {
        tenantId_studentId_levelId: {
          tenantId,
          studentId,
          levelId: currentLevel.id
        }
      },
      update: {
        completedAt: new Date()
      },
      create: {
        tenantId,
        studentId,
        levelId: currentLevel.id,
        completedAt: new Date()
      }
    });

    await tx.studentLevelProgressionHistory.create({
      data: {
        tenantId,
        studentId,
        fromLevelId: currentLevel.id,
        toLevelId: targetLevel.id,
        score: passResult.score,
        passed: true,
        promotedByUserId: actorUserId,
        reason
      }
    });

    await tx.student.update({
      where: {
        id: student.id
      },
      data: {
        levelId: targetLevel.id
      }
    });

    return {
      studentId: student.id,
      previousLevelId: currentLevel.id,
      newLevelId: targetLevel.id,
      changed: true,
      score: passResult.score,
      threshold: passResult.threshold
    };
  });
}

async function validateInitialStudentLevel({ tx, tenantId, levelId }) {
  const level = await tx.level.findFirst({
    where: {
      id: levelId,
      tenantId
    },
    select: {
      id: true,
      rank: true
    }
  });

  if (!level) {
    throw lifecycleError("Level not found in tenant scope", 404, "LEVEL_NOT_FOUND");
  }

  if (level.rank !== 1) {
    throw lifecycleError("New students must start at Level 1", 409, "INITIAL_LEVEL_MUST_BE_ONE");
  }

  return level;
}

export { assignLevelWithIntegrity, evaluatePassThreshold, validateInitialStudentLevel };
