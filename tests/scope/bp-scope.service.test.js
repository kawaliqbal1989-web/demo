import { jest } from "@jest/globals";
import {
  assertBusinessPartnerFranchiseAccess,
  clearBusinessPartnerScopeCache,
  getAccessibleCenterIds,
  getAccessibleFranchiseIds,
  resolveBusinessPartnerScope,
  validateCenterAccess,
  validateFranchiseAccess
} from "../../src/services/bp-scope.service.js";
import {
  applyBpScopeToCenterQuery,
  applyBpScopeToFranchiseQuery,
  applyBpScopeToStudentQuery,
  applyBpScopeToTeacherQuery,
  BP_SCOPE_IMPOSSIBLE_TOKEN
} from "../../src/utils/bp-scope-filters.js";

function createTx(overrides = {}) {
  return {
    authUser: { findFirst: jest.fn() },
    businessPartner: { findFirst: jest.fn() },
    businessPartnerFranchise: { findMany: jest.fn() },
    franchiseProfile: { findMany: jest.fn() },
    businessPartnerCenterScope: { findMany: jest.fn() },
    centerProfile: { findMany: jest.fn() },
    hierarchyNode: { findMany: jest.fn() },
    ...overrides
  };
}

describe("bp-scope.service", () => {
  afterEach(() => {
    clearBusinessPartnerScopeCache();
  });

  test("assertBusinessPartnerFranchiseAccess returns a normalized scoped franchise id", () => {
    expect(
      assertBusinessPartnerFranchiseAccess({
        tenantId: "tenant-1",
        bpScope: {
          tenantId: "tenant-1",
          businessPartner: { id: "bp-1" },
          franchiseIds: ["fr-1", "fr-2"]
        },
        franchiseId: "  fr-1  "
      })
    ).toBe("fr-1");
  });

  test("assertBusinessPartnerFranchiseAccess rejects empty or malformed ids with 400 errors", () => {
    expect(() =>
      assertBusinessPartnerFranchiseAccess({
        tenantId: "tenant-1",
        bpScope: {
          tenantId: "tenant-1",
          businessPartner: { id: "bp-1" },
          franchiseIds: ["fr-1"]
        },
        franchiseId: "   "
      })
    ).toThrow("franchiseId is required");

    try {
      assertBusinessPartnerFranchiseAccess({
        tenantId: "tenant-1",
        bpScope: {
          tenantId: "tenant-1",
          businessPartner: { id: "bp-1" },
          franchiseIds: ["fr-1"]
        },
        franchiseId: ["fr-1"]
      });
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 400,
        errorCode: "FRANCHISEID_INVALID"
      });
    }
  });

  test("assertBusinessPartnerFranchiseAccess rejects unresolved or mismatched BP scope", () => {
    try {
      assertBusinessPartnerFranchiseAccess({
        tenantId: "tenant-1",
        bpScope: {
          tenantId: "tenant-2",
          businessPartner: { id: "bp-1" },
          franchiseIds: ["fr-1"]
        },
        franchiseId: "fr-1"
      });
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 403,
        errorCode: "BP_SCOPE_REQUIRED"
      });
    }
  });

  test("assertBusinessPartnerFranchiseAccess masks foreign franchise access as not found", () => {
    try {
      assertBusinessPartnerFranchiseAccess({
        tenantId: "tenant-1",
        bpScope: {
          tenantId: "tenant-1",
          businessPartner: { id: "bp-1" },
          franchiseIds: ["fr-1"]
        },
        franchiseId: "fr-2"
      });
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 404,
        errorCode: "FRANCHISE_NOT_FOUND"
      });
    }
  });

  test("getAccessibleFranchiseIds keeps legacy fallback but lets explicit inactive rows block it", async () => {
    const tx = createTx();
    tx.businessPartnerFranchise.findMany.mockResolvedValue([
      { franchiseId: "fr-blocked", status: "INACTIVE", activeFrom: null, activeTo: null },
      { franchiseId: "fr-explicit", status: "ACTIVE", activeFrom: null, activeTo: null }
    ]);
    tx.franchiseProfile.findMany.mockResolvedValue([
      { id: "fr-blocked", businessPartnerId: "bp-1", status: "ACTIVE" },
      { id: "fr-explicit", businessPartnerId: null, status: "ACTIVE" },
      { id: "fr-legacy", businessPartnerId: "bp-1", status: "ACTIVE" },
      { id: "fr-archived", businessPartnerId: "bp-1", status: "ARCHIVED" }
    ]);

    await expect(
      getAccessibleFranchiseIds({ tenantId: "tenant-1", businessPartnerId: "bp-1", tx })
    ).resolves.toEqual(["fr-explicit", "fr-legacy"]);
  });

  test("getAccessibleCenterIds merges explicit, franchise-derived and legacy sources without re-adding blocked centers", async () => {
    const tx = createTx();
    tx.businessPartnerCenterScope.findMany.mockResolvedValue([
      { centerId: "center-blocked", status: "SUSPENDED", activeFrom: null, activeTo: null },
      { centerId: "center-explicit", status: "ACTIVE", activeFrom: null, activeTo: null }
    ]);
    tx.centerProfile.findMany.mockResolvedValue([
      {
        id: "center-blocked",
        franchiseProfileId: "fr-legacy",
        status: "ACTIVE",
        franchiseProfile: { businessPartnerId: "bp-1" }
      },
      {
        id: "center-explicit",
        franchiseProfileId: "fr-other",
        status: "ACTIVE",
        franchiseProfile: { businessPartnerId: null }
      },
      {
        id: "center-derived",
        franchiseProfileId: "fr-explicit",
        status: "ACTIVE",
        franchiseProfile: { businessPartnerId: null }
      },
      {
        id: "center-legacy",
        franchiseProfileId: "fr-untracked",
        status: "ACTIVE",
        franchiseProfile: { businessPartnerId: "bp-1" }
      }
    ]);

    await expect(
      getAccessibleCenterIds({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        franchiseIds: ["fr-explicit", "fr-legacy"],
        tx
      })
    ).resolves.toEqual(["center-explicit", "center-derived", "center-legacy"]);

    const callArgs = tx.centerProfile.findMany.mock.calls[0][0];
    expect(callArgs.where.OR).toEqual(
      expect.arrayContaining([
        { id: { in: ["center-blocked", "center-explicit"] } }
      ])
    );
  });

  test("resolveBusinessPartnerScope deduplicates explicit scope and hierarchy traversal roots", async () => {
    const tx = createTx();
    tx.businessPartner.findFirst.mockResolvedValue({
      id: "bp-1",
      tenantId: "tenant-1",
      code: "BP001",
      name: "BP One",
      hierarchyNodeId: "bp-root",
      accessMode: "ALL",
      isActive: true,
      status: "ACTIVE"
    });
    tx.businessPartnerFranchise.findMany.mockResolvedValue([
      { franchiseId: "fr-1", status: "ACTIVE", activeFrom: null, activeTo: null }
    ]);
    tx.franchiseProfile.findMany
      .mockResolvedValueOnce([
        { id: "fr-1", businessPartnerId: "bp-1", status: "ACTIVE" }
      ])
      .mockResolvedValueOnce([
        { authUser: { hierarchyNodeId: "fr-root" } }
      ]);
    tx.businessPartnerCenterScope.findMany.mockResolvedValue([
      { centerId: "center-1", status: "ACTIVE", activeFrom: null, activeTo: null }
    ]);
    tx.centerProfile.findMany
      .mockResolvedValueOnce([
        {
          id: "center-1",
          franchiseProfileId: "fr-1",
          status: "ACTIVE",
          franchiseProfile: { businessPartnerId: "bp-1" }
        }
      ])
      .mockResolvedValueOnce([
        { authUser: { hierarchyNodeId: "center-root" } }
      ]);
    tx.hierarchyNode.findMany
      .mockResolvedValueOnce([{ id: "child-1" }, { id: "child-2" }])
      .mockResolvedValueOnce([]);

    const scope = await resolveBusinessPartnerScope({
      tenantId: "tenant-1",
      businessPartnerId: "bp-1",
      tx
    });

    expect(scope.businessPartner.id).toBe("bp-1");
    expect(scope.franchiseIds).toEqual(["fr-1"]);
    expect(scope.centerIds).toEqual(["center-1"]);
    expect(scope.hierarchyNodeIds).toEqual(["bp-root", "fr-root", "center-root", "child-1", "child-2"]);
    expect(scope.meta.cacheHit).toBe(false);
  });

  test("validate access helpers return strict booleans from a resolved scope", async () => {
    const bpScope = {
      tenantId: "tenant-1",
      businessPartner: { id: "bp-1" },
      franchiseIds: ["fr-1"],
      centerIds: ["center-1"]
    };

    await expect(
      validateFranchiseAccess({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        franchiseId: "fr-1",
        bpScope
      })
    ).resolves.toBe(true);

    await expect(
      validateFranchiseAccess({
        tenantId: "tenant-2",
        businessPartnerId: "bp-1",
        franchiseId: "fr-1",
        bpScope
      })
    ).resolves.toBe(false);

    await expect(
      validateCenterAccess({
        tenantId: "tenant-1",
        businessPartnerId: "bp-1",
        centerId: "center-2",
        bpScope
      })
    ).resolves.toBe(false);
  });

  test("scope filter utilities stay tenant-safe and deny by default when scope is empty", () => {
    const emptyScope = {
      hierarchyNodeIds: [BP_SCOPE_IMPOSSIBLE_TOKEN],
      franchiseIds: [BP_SCOPE_IMPOSSIBLE_TOKEN],
      centerIds: [BP_SCOPE_IMPOSSIBLE_TOKEN]
    };

    expect(
      applyBpScopeToCenterQuery({
        tenantId: "tenant-1",
        bpScope: emptyScope,
        where: { status: "ACTIVE" }
      })
    ).toEqual({
      AND: [
        { tenantId: "tenant-1" },
        { id: { in: [BP_SCOPE_IMPOSSIBLE_TOKEN] } },
        { status: "ACTIVE" }
      ]
    });

    expect(
      applyBpScopeToFranchiseQuery({
        tenantId: "tenant-1",
        bpScope: { franchiseIds: ["fr-1"], hierarchyNodeIds: [] }
      })
    ).toEqual({
      AND: [{ tenantId: "tenant-1" }, { id: { in: ["fr-1"] } }]
    });

    expect(
      applyBpScopeToStudentQuery({
        tenantId: "tenant-1",
        bpScope: { hierarchyNodeIds: ["node-1"] },
        where: { isActive: true }
      })
    ).toEqual({
      AND: [
        { tenantId: "tenant-1" },
        { hierarchyNodeId: { in: ["node-1"] } },
        { isActive: true }
      ]
    });

    expect(
      applyBpScopeToTeacherQuery({
        tenantId: "tenant-1",
        bpScope: { hierarchyNodeIds: ["node-1"] }
      })
    ).toEqual({
      AND: [{ tenantId: "tenant-1" }, { hierarchyNodeId: { in: ["node-1"] } }]
    });
  });
});