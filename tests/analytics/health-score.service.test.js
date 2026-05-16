import {
  calculateBusinessPartnerHealthScore,
  calculateCenterHealthScore,
  calculateFranchiseHealthScore,
  normalizeGrowthPercent,
  normalizeTeacherActivity
} from "../../src/services/health-score.service.js";

describe("health-score.service", () => {
  test("center health score uses weighted normalized inputs", () => {
    const result = calculateCenterHealthScore({
      attendancePercent: 92,
      retentionPercent: 85,
      monthlyRevenue: 900,
      pendingFees: 100,
      studentGrowthPercent: 10,
      teacherCount: 3,
      activeStudents: 45
    });

    expect(result.score).toBeGreaterThan(70);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.normalizedMetrics.feeRecovery).toBe(90);
  });

  test("franchise and business partner scores fall back safely on missing data", () => {
    const franchise = calculateFranchiseHealthScore({});
    const bp = calculateBusinessPartnerHealthScore({});

    expect(franchise.score).toBe(50);
    expect(bp.score).toBe(50);
  });

  test("growth and teacher activity normalization clamp correctly", () => {
    expect(normalizeGrowthPercent(50)).toBe(100);
    expect(normalizeGrowthPercent(-50)).toBe(0);
    expect(normalizeTeacherActivity({ teacherCount: 0, activeStudents: 50 })).toBe(0);
    expect(normalizeTeacherActivity({ teacherCount: 2, activeStudents: 40 })).toBe(100);
  });
});