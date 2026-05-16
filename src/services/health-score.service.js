function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundScore(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(toNumber(value) * factor) / factor;
}

function clampScore(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, roundScore(value, 2)));
}

function normalizePercent(value, { fallback = 50 } = {}) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return clampScore(value);
}

function normalizeRatio(numerator, denominator, { fallback = 50 } = {}) {
  const normalizedDenominator = toNumber(denominator);
  if (normalizedDenominator <= 0) {
    return fallback;
  }

  return clampScore((toNumber(numerator) / normalizedDenominator) * 100);
}

function normalizeGrowthPercent(value, { neutral = 50, positiveCap = 25, negativeCap = -25 } = {}) {
  const normalized = toNumber(value);
  if (!Number.isFinite(normalized)) {
    return neutral;
  }

  if (normalized >= positiveCap) {
    return 100;
  }

  if (normalized <= negativeCap) {
    return 0;
  }

  const span = positiveCap - negativeCap;
  if (span <= 0) {
    return neutral;
  }

  return clampScore(((normalized - negativeCap) / span) * 100);
}

function normalizeCollectionScore({ collectedAmount = 0, pendingAmount = 0, collectionPercent } = {}) {
  if (collectionPercent !== undefined && collectionPercent !== null) {
    return normalizePercent(collectionPercent);
  }

  const collected = Math.max(0, toNumber(collectedAmount));
  const pending = Math.max(0, toNumber(pendingAmount));
  if (collected === 0 && pending === 0) {
    return 50;
  }

  return clampScore((collected / (collected + pending)) * 100);
}

function normalizeTeacherActivity({ teacherActivityPercent, teacherCount = 0, activeStudents = 0, targetStudentsPerTeacher = 25 } = {}) {
  if (teacherActivityPercent !== undefined && teacherActivityPercent !== null) {
    return normalizePercent(teacherActivityPercent);
  }

  const students = Math.max(0, toNumber(activeStudents));
  const teachers = Math.max(0, toNumber(teacherCount));

  if (students === 0) {
    return teachers > 0 ? 100 : 50;
  }

  const targetTeachers = Math.max(1, Math.ceil(students / Math.max(1, targetStudentsPerTeacher)));
  return normalizeRatio(teachers, targetTeachers, { fallback: 25 });
}

function computeWeightedScore(metrics, weights, { fallback = 50 } = {}) {
  const entries = Object.entries(weights || {}).filter(([, weight]) => toNumber(weight) > 0);
  if (!entries.length) {
    return {
      score: fallback,
      normalizedMetrics: {}
    };
  }

  const totalWeight = entries.reduce((sum, [, weight]) => sum + toNumber(weight), 0);
  const normalizedMetrics = {};
  let weightedTotal = 0;

  for (const [key, weight] of entries) {
    const normalizedValue = normalizePercent(metrics[key], { fallback });
    normalizedMetrics[key] = normalizedValue;
    weightedTotal += normalizedValue * toNumber(weight);
  }

  return {
    score: roundScore(weightedTotal / totalWeight, 2),
    normalizedMetrics
  };
}

const DEFAULT_HEALTH_WEIGHTS = Object.freeze({
  businessPartner: Object.freeze({
    collections: 0.25,
    growth: 0.2,
    attendance: 0.2,
    retention: 0.2,
    activeStudentRatio: 0.15
  }),
  franchise: Object.freeze({
    collections: 0.25,
    growth: 0.2,
    attendance: 0.2,
    retention: 0.2,
    activeStudentRatio: 0.15
  }),
  center: Object.freeze({
    attendance: 0.3,
    retention: 0.2,
    feeRecovery: 0.2,
    growth: 0.15,
    teacherActivity: 0.15
  })
});

function calculateFranchiseHealthScore(inputs = {}, options = {}) {
  const weights = options.weights || DEFAULT_HEALTH_WEIGHTS.franchise;
  const metrics = {
    collections: normalizeCollectionScore({
      collectedAmount: inputs.monthlyCollections,
      pendingAmount: inputs.pendingFees,
      collectionPercent: inputs.collectionPercent
    }),
    growth: normalizeGrowthPercent(inputs.studentGrowthPercent),
    attendance: normalizePercent(inputs.attendancePercent),
    retention: normalizePercent(inputs.retentionPercent),
    activeStudentRatio: normalizePercent(
      inputs.activeStudentRatio !== undefined
        ? inputs.activeStudentRatio
        : normalizeRatio(inputs.activeStudents, inputs.studentCount, { fallback: 50 })
    )
  };

  const { score, normalizedMetrics } = computeWeightedScore(metrics, weights, options);
  return {
    score,
    weights,
    normalizedMetrics
  };
}

function calculateBusinessPartnerHealthScore(inputs = {}, options = {}) {
  const weights = options.weights || DEFAULT_HEALTH_WEIGHTS.businessPartner;
  const metrics = {
    collections: normalizeCollectionScore({
      collectedAmount: inputs.monthlyCollections,
      pendingAmount: inputs.pendingFees,
      collectionPercent: inputs.collectionPercent
    }),
    growth: normalizeGrowthPercent(inputs.studentGrowthPercent),
    attendance: normalizePercent(inputs.attendancePercent),
    retention: normalizePercent(inputs.retentionPercent),
    activeStudentRatio: normalizePercent(
      inputs.activeStudentRatio !== undefined
        ? inputs.activeStudentRatio
        : normalizeRatio(inputs.activeStudents, inputs.totalStudents, { fallback: 50 })
    )
  };

  const { score, normalizedMetrics } = computeWeightedScore(metrics, weights, options);
  return {
    score,
    weights,
    normalizedMetrics
  };
}

function calculateCenterHealthScore(inputs = {}, options = {}) {
  const weights = options.weights || DEFAULT_HEALTH_WEIGHTS.center;
  const metrics = {
    attendance: normalizePercent(inputs.attendancePercent),
    retention: normalizePercent(inputs.retentionPercent),
    feeRecovery: normalizeCollectionScore({
      collectedAmount: inputs.monthlyRevenue,
      pendingAmount: inputs.pendingFees,
      collectionPercent: inputs.feeRecoveryPercent
    }),
    growth: normalizeGrowthPercent(inputs.studentGrowthPercent),
    teacherActivity: normalizeTeacherActivity({
      teacherActivityPercent: inputs.teacherActivityPercent,
      teacherCount: inputs.teacherCount,
      activeStudents: inputs.activeStudents,
      targetStudentsPerTeacher: options.targetStudentsPerTeacher
    })
  };

  const { score, normalizedMetrics } = computeWeightedScore(metrics, weights, options);
  return {
    score,
    weights,
    normalizedMetrics
  };
}

export {
  DEFAULT_HEALTH_WEIGHTS,
  calculateBusinessPartnerHealthScore,
  calculateCenterHealthScore,
  calculateFranchiseHealthScore,
  clampScore,
  normalizeCollectionScore,
  normalizeGrowthPercent,
  normalizePercent,
  normalizeRatio,
  normalizeTeacherActivity,
  roundScore,
  toNumber
};