import { jest } from "@jest/globals";
import {
  NO_RESULT_ROW_ID,
  canReadCompetitionResults,
  resolveCompetitionResultEnrollmentWhere
} from "../../src/services/competition-result-scope.service.js";
import {
  generateCompetitionCertificates,
  revokeCompetitionCertificates
} from "../../src/services/competition-certificate.service.js";
import { buildAuthenticatedContext } from "../../src/middleware/authenticate.js";

function createScopeTx() {
  return {
    teacherProfile: { findFirst: jest.fn() },
    centerProfile: { findFirst: jest.fn(), findMany: jest.fn() },
    franchiseProfile: { findFirst: jest.fn() }
  };
}

function auth(role, overrides = {}) {
  return {
    tenantId: "tenant-1",
    userId: `${role.toLowerCase()}-1`,
    role,
    hierarchyNodeId: `${role.toLowerCase()}-token-node`,
    ...overrides
  };
}

function expectDeniedScope(where) {
  expect(where).toEqual({ id: { in: [NO_RESULT_ROW_ID] } });
}

describe("Competition result scope", () => {
  test("Superadmin receives the complete tenant result set", async () => {
    await expect(
      resolveCompetitionResultEnrollmentWhere({
        auth: auth("SUPERADMIN"),
        tx: createScopeTx()
      })
    ).resolves.toEqual({});
  });

  test("Teacher sees only rows submitted by the same active Teacher account", async () => {
    const tx = createScopeTx();
    tx.teacherProfile.findFirst.mockResolvedValue({ id: "teacher-profile-1" });

    await expect(
      resolveCompetitionResultEnrollmentWhere({
        auth: auth("TEACHER", { userId: "teacher-user-1" }),
        tx
      })
    ).resolves.toEqual({ sourceTeacherUserId: "teacher-user-1" });

    expect(tx.teacherProfile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          authUserId: "teacher-user-1",
          isActive: true,
          status: "ACTIVE"
        })
      })
    );
  });

  test("Inactive Teacher profile is denied by default", async () => {
    const tx = createScopeTx();
    tx.teacherProfile.findFirst.mockResolvedValue(null);

    expectDeniedScope(
      await resolveCompetitionResultEnrollmentWhere({
        auth: auth("TEACHER"),
        tx
      })
    );
  });

  test("Center scope is resolved from the active database profile, not the JWT node", async () => {
    const tx = createScopeTx();
    tx.centerProfile.findFirst.mockResolvedValue({
      authUser: { hierarchyNodeId: "current-center-node", isActive: true }
    });

    await expect(
      resolveCompetitionResultEnrollmentWhere({
        auth: auth("CENTER", { hierarchyNodeId: "stale-token-node" }),
        tx
      })
    ).resolves.toEqual({ hierarchyNodeId: "current-center-node" });
  });

  test("Franchise scope excludes inactive Centers and inactive Center users", async () => {
    const tx = createScopeTx();
    tx.franchiseProfile.findFirst.mockResolvedValue({ id: "franchise-1" });
    tx.centerProfile.findMany.mockResolvedValue([
      { authUser: { hierarchyNodeId: "center-node-1", isActive: true } },
      { authUser: { hierarchyNodeId: "center-node-2", isActive: false } }
    ]);

    await expect(
      resolveCompetitionResultEnrollmentWhere({
        auth: auth("FRANCHISE"),
        tx
      })
    ).resolves.toEqual({ hierarchyNodeId: { in: ["center-node-1"] } });

    expect(tx.centerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-1",
          franchiseProfileId: "franchise-1",
          isActive: true,
          status: "ACTIVE"
        })
      })
    );
  });

  test("BP result scope honors the canonical explicit Center scope", async () => {
    const tx = createScopeTx();
    const resolveBpScope = jest.fn().mockResolvedValue({
      centerIds: ["center-profile-2", "center-profile-1", "center-profile-2"]
    });
    tx.centerProfile.findMany.mockResolvedValue([
      { authUser: { hierarchyNodeId: "center-node-1", isActive: true } },
      { authUser: { hierarchyNodeId: "center-node-2", isActive: true } }
    ]);

    await expect(
      resolveCompetitionResultEnrollmentWhere({
        auth: auth("BP"),
        tx,
        resolveBpScope
      })
    ).resolves.toEqual({
      hierarchyNodeId: { in: ["center-node-1", "center-node-2"] }
    });

    expect(resolveBpScope).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "bp-1",
      tx
    });
    expect(tx.centerProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          id: { in: ["center-profile-2", "center-profile-1"] },
          isActive: true,
          status: "ACTIVE"
        }
      })
    );
  });

  test("Unknown roles and unresolved BP scopes return an impossible filter", async () => {
    expectDeniedScope(
      await resolveCompetitionResultEnrollmentWhere({
        auth: auth("STUDENT"),
        tx: createScopeTx()
      })
    );

    expectDeniedScope(
      await resolveCompetitionResultEnrollmentWhere({
        auth: auth("BP"),
        tx: createScopeTx(),
        resolveBpScope: jest.fn().mockResolvedValue(null)
      })
    );
  });
});

describe("Competition result publication embargo", () => {
  test("operational roles can read only published results", () => {
    for (const role of ["BP", "FRANCHISE", "CENTER", "TEACHER"]) {
      expect(
        canReadCompetitionResults({ auth: auth(role), resultStatus: "DRAFT" })
      ).toBe(false);
      expect(
        canReadCompetitionResults({ auth: auth(role), resultStatus: "LOCKED" })
      ).toBe(false);
      expect(
        canReadCompetitionResults({ auth: auth(role), resultStatus: "PUBLISHED" })
      ).toBe(true);
    }
  });

  test("Superadmin can preview draft results while Student remains denied", () => {
    expect(
      canReadCompetitionResults({ auth: auth("SUPERADMIN"), resultStatus: "DRAFT" })
    ).toBe(true);
    expect(
      canReadCompetitionResults({ auth: auth("STUDENT"), resultStatus: "PUBLISHED" })
    ).toBe(false);
  });
});

describe("Database-authoritative authentication context", () => {
  test("stale role, hierarchy and Student claims are replaced with current database values", () => {
    const payload = {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "SUPERADMIN",
      hierarchyNodeId: "old-node",
      studentId: "old-student",
      username: "old-name"
    };
    const user = {
      id: "user-1",
      tenantId: "tenant-1",
      role: "CENTER",
      hierarchyNodeId: "current-node",
      studentId: null,
      username: "CE001"
    };

    expect(buildAuthenticatedContext({ payload, user })).toEqual({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "CENTER",
      hierarchyNodeId: "current-node",
      studentId: null,
      username: "CE001"
    });
  });

  test("mismatched token and database users cannot form an auth context", () => {
    expect(
      buildAuthenticatedContext({
        payload: { userId: "user-1" },
        user: { id: "user-2" }
      })
    ).toBeNull();
  });
});

function certificateEnrollment() {
  return {
    id: "enrollment-1",
    studentId: "student-1",
    enrolledLevelId: "level-1",
    isTemporary: true,
    rank: 1,
    totalScore: 98,
    resultCompletionTimeSeconds: 42,
    resultSubmissionId: "submission-1",
    resultCalculatedAt: new Date("2026-08-15T10:00:00.000Z"),
    student: {
      admissionNo: "TST0001",
      firstName: "Test",
      lastName: "Student"
    },
    competitionCourseLevel: {
      id: "competition-level-1",
      levelNumber: 1,
      level: { id: "level-1", name: "Level 1", rank: 1 },
      competitionCourse: { id: "course-1", code: "AB8", name: "Abacus 8-12" }
    }
  };
}

function createCertificateDb({ existing = [], count = 1 } = {}) {
  return {
    competition: {
      findFirst: jest.fn().mockResolvedValue({
        id: "competition-1",
        code: "0002",
        title: "Competition",
        resultStatus: "PUBLISHED",
        resultPublishedAt: new Date("2026-08-15T11:00:00.000Z"),
        startsAt: new Date("2026-08-14T11:00:00.000Z"),
        endsAt: new Date("2026-08-15T10:00:00.000Z")
      })
    },
    competitionEnrollment: {
      findMany: jest.fn().mockResolvedValue([certificateEnrollment()])
    },
    certificate: {
      findMany: jest.fn().mockResolvedValue(existing),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      count: jest.fn().mockResolvedValue(count)
    }
  };
}

describe("Competition certificate lifecycle", () => {
  test("publication creates one immutable certificate snapshot for each completed participation ID", async () => {
    const db = createCertificateDb();
    const brandingSnapshotBuilder = jest.fn().mockResolvedValue({ logoUrl: "/logo.png" });

    await expect(
      generateCompetitionCertificates({
        competitionId: "competition-1",
        tenantId: "tenant-1",
        issuedByUserId: "superadmin-1",
        db,
        brandingSnapshotBuilder
      })
    ).resolves.toEqual({ eligible: 1, created: 1, existing: 0, reactivated: 0 });

    const created = db.certificate.createMany.mock.calls[0][0].data[0];
    expect(created).toMatchObject({
      tenantId: "tenant-1",
      studentId: "student-1",
      levelId: "level-1",
      competitionId: "competition-1",
      competitionEnrollmentId: "enrollment-1",
      issuedByUserId: "superadmin-1",
      status: "ISSUED"
    });
    expect(created.certificateNumber).toMatch(/^COMP-0002-TST0001-1-/);
    expect(typeof created.metadata).toBe("string");
    expect(JSON.parse(created.metadata)).toMatchObject({
      source: "COMPETITION",
      admissionNo: "TST0001"
    });
  });

  test("repeat publication is idempotent for an existing issued certificate", async () => {
    const db = createCertificateDb({
      existing: [
        {
          id: "certificate-1",
          competitionEnrollmentId: "enrollment-1",
          status: "ISSUED",
          reason: "Competition result published"
        }
      ]
    });

    await expect(
      generateCompetitionCertificates({
        competitionId: "competition-1",
        tenantId: "tenant-1",
        issuedByUserId: "superadmin-1",
        db,
        brandingSnapshotBuilder: jest.fn()
      })
    ).resolves.toEqual({ eligible: 1, created: 0, existing: 1, reactivated: 0 });

    expect(db.certificate.createMany).not.toHaveBeenCalled();
    expect(db.certificate.updateMany).not.toHaveBeenCalled();
  });

  test("unpublishing revokes issued Competition certificates and republishing reactivates only those revocations", async () => {
    const db = createCertificateDb({
      existing: [
        {
          id: "certificate-1",
          competitionEnrollmentId: "enrollment-1",
          status: "REVOKED",
          reason: "Competition results unpublished"
        }
      ]
    });

    await expect(
      revokeCompetitionCertificates({
        competitionId: "competition-1",
        tenantId: "tenant-1",
        revokedByUserId: "superadmin-1",
        db
      })
    ).resolves.toMatchObject({ revoked: 1 });

    expect(db.certificate.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        tenantId: "tenant-1",
        competitionId: "competition-1",
        status: "ISSUED"
      },
      data: {
        status: "REVOKED",
        revokedByUserId: "superadmin-1",
        reason: "Competition results unpublished"
      }
    });

    db.certificate.updateMany.mockClear();
    await expect(
      generateCompetitionCertificates({
        competitionId: "competition-1",
        tenantId: "tenant-1",
        issuedByUserId: "superadmin-1",
        db,
        brandingSnapshotBuilder: jest.fn()
      })
    ).resolves.toEqual({ eligible: 1, created: 0, existing: 0, reactivated: 1 });

    expect(db.certificate.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["certificate-1"] },
          status: "REVOKED",
          reason: "Competition results unpublished"
        }),
        data: expect.objectContaining({
          status: "ISSUED",
          revokedAt: null,
          revokedByUserId: null
        })
      })
    );
  });
});
