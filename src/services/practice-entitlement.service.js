/**
 * Practice Feature Entitlement Service
 *
 * Manages the 3-layer practice feature allocation:
 * 1. Superadmin → BP: Total seat purchase (BusinessPartnerPracticeEntitlement)
 * 2. BP/Franchise → Center: Per-center seat allocation (CenterPracticeAllocation)
 * 3. Center → Student: Student assignments (StudentPracticeAssignment)
 */

import { prisma } from "../lib/prisma.js";
import { recordAudit } from "../utils/audit.js";
import { isSchemaMismatchError } from "../utils/schema-mismatch.js";
import { resolveHierarchyNodeIdsFromRoot } from "./hierarchy-cascade.service.js";

function buildEmptyBPEntitlements() {
  return {
    PRACTICE: null,
    ABACUS_PRACTICE: null
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer 1: Superadmin manages BP entitlements
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get BP entitlements for both features with usage counts
 */
export async function getBPEntitlements({ tenantId, businessPartnerId }) {
  try {
    const entitlements = await prisma.businessPartnerPracticeEntitlement.findMany({
      where: { tenantId, businessPartnerId },
      include: {
        centerAllocations: {
          select: {
            id: true,
            centerNodeId: true,
            allocatedSeats: true,
            _count: {
              select: {
                studentAssignments: {
                  where: { isActive: true }
                }
              }
            }
          }
        }
      }
    });

    const result = buildEmptyBPEntitlements();

    for (const ent of entitlements) {
      const totalAllocated = ent.centerAllocations.reduce((sum, ca) => sum + ca.allocatedSeats, 0);
      const totalAssigned = ent.centerAllocations.reduce((sum, ca) => sum + ca._count.studentAssignments, 0);

      result[ent.featureKey] = {
        id: ent.id,
        featureKey: ent.featureKey,
        isEnabled: ent.isEnabled,
        totalSeats: ent.totalSeats,
        allocatedSeats: totalAllocated,
        assignedStudents: totalAssigned,
        remainingToAllocate: ent.totalSeats - totalAllocated,
        centerCount: ent.centerAllocations.length,
        createdAt: ent.createdAt,
        updatedAt: ent.updatedAt
      };
    }

    return result;
  } catch (error) {
    if (!isSchemaMismatchError(error, ["businesspartnerpracticeentitlement", "centerpracticeallocation"])) {
      throw error;
    }

    return buildEmptyBPEntitlements();
  }
}

/**
 * Upsert BP entitlement (Superadmin only)
 */
export async function upsertBPEntitlement({
  tenantId,
  businessPartnerId,
  featureKey,
  isEnabled,
  totalSeats,
  actorUserId
}) {
  // Validate totalSeats is non-negative
  if (totalSeats < 0) {
    const error = new Error("Total seats cannot be negative");
    error.statusCode = 400;
    error.errorCode = "INVALID_SEAT_COUNT";
    throw error;
  }

  // Check if reducing below already allocated
  const existing = await prisma.businessPartnerPracticeEntitlement.findUnique({
    where: {
      tenantId_businessPartnerId_featureKey: {
        tenantId,
        businessPartnerId,
        featureKey
      }
    },
    include: {
      centerAllocations: {
        select: { allocatedSeats: true }
      }
    }
  });

  const currentAllocated = existing
    ? existing.centerAllocations.reduce((sum, ca) => sum + ca.allocatedSeats, 0)
    : 0;

  if (totalSeats < currentAllocated) {
    const error = new Error(
      `Cannot reduce total seats to ${totalSeats}. Already allocated ${currentAllocated} seats to centers.`
    );
    error.statusCode = 400;
    error.errorCode = "SEATS_ALREADY_ALLOCATED";
    throw error;
  }

  const entitlement = await prisma.businessPartnerPracticeEntitlement.upsert({
    where: {
      tenantId_businessPartnerId_featureKey: {
        tenantId,
        businessPartnerId,
        featureKey
      }
    },
    update: {
      isEnabled,
      totalSeats,
      updatedAt: new Date()
    },
    create: {
      tenantId,
      businessPartnerId,
      featureKey,
      isEnabled,
      totalSeats,
      createdByUserId: actorUserId
    }
  });

  // Audit
  await recordAudit({
    tenantId,
    userId: actorUserId,
    role: "SUPERADMIN",
    action: "PRACTICE_ENTITLEMENT_UPDATE",
    entityType: "BusinessPartnerPracticeEntitlement",
    entityId: entitlement.id,
    metadata: {
      businessPartnerId,
      featureKey,
      isEnabled,
      totalSeats,
      previousSeats: existing?.totalSeats ?? null,
      previousEnabled: existing?.isEnabled ?? null
    }
  });

  return entitlement;
}

/**
 * Get BP usage report with center-wise breakdown (for Superadmin view)
 */
export async function getBPUsageReport({ tenantId, businessPartnerId }) {
  const entitlements = await prisma.businessPartnerPracticeEntitlement.findMany({
    where: { tenantId, businessPartnerId },
    include: {
      centerAllocations: {
        include: {
          centerNode: {
            select: { id: true, name: true, code: true }
          },
          _count: {
            select: {
              studentAssignments: { where: { isActive: true } }
            }
          }
        }
      }
    }
  });

  const report = {};

  for (const ent of entitlements) {
    const centerBreakdown = ent.centerAllocations.map(ca => ({
      centerId: ca.centerNodeId,
      centerName: ca.centerNode?.name || "Unknown",
      centerCode: ca.centerNode?.code || null,
      allocatedSeats: ca.allocatedSeats,
      assignedStudents: ca._count.studentAssignments,
      remainingSeats: ca.allocatedSeats - ca._count.studentAssignments
    }));

    const totalAllocated = centerBreakdown.reduce((sum, c) => sum + c.allocatedSeats, 0);
    const totalAssigned = centerBreakdown.reduce((sum, c) => sum + c.assignedStudents, 0);

    report[ent.featureKey] = {
      featureKey: ent.featureKey,
      isEnabled: ent.isEnabled,
      purchasedSeats: ent.totalSeats,
      allocatedSeats: totalAllocated,
      assignedStudents: totalAssigned,
      unallocatedSeats: ent.totalSeats - totalAllocated,
      centerCount: centerBreakdown.length,
      centers: centerBreakdown
    };
  }

  // Ensure both features appear in response
  if (!report.PRACTICE) {
    report.PRACTICE = {
      featureKey: "PRACTICE",
      isEnabled: false,
      purchasedSeats: 0,
      allocatedSeats: 0,
      assignedStudents: 0,
      unallocatedSeats: 0,
      centerCount: 0,
      centers: []
    };
  }
  if (!report.ABACUS_PRACTICE) {
    report.ABACUS_PRACTICE = {
      featureKey: "ABACUS_PRACTICE",
      isEnabled: false,
      purchasedSeats: 0,
      allocatedSeats: 0,
      assignedStudents: 0,
      unallocatedSeats: 0,
      centerCount: 0,
      centers: []
    };
  }

  return report;
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer 2: BP/Franchise allocates seats to centers
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get center allocations for a BP (for BP/Franchise view)
 * Returns all centers under the BP with their current allocation state
 */
export async function getCenterAllocationsForBP({
  tenantId,
  businessPartnerId,
  actorHierarchyNodeIds // For franchise scope filtering
}) {
  const bp = await prisma.businessPartner.findUnique({
    where: { id: businessPartnerId },
    select: { hierarchyNodeId: true }
  });

  // Get entitlements for this BP
  const entitlements = await prisma.businessPartnerPracticeEntitlement.findMany({
    where: { tenantId, businessPartnerId },
    include: {
      centerAllocations: {
        include: {
          centerNode: {
            select: { id: true, name: true, code: true, type: true }
          },
          _count: {
            select: {
              studentAssignments: { where: { isActive: true } }
            }
          }
        }
      }
    }
  });

  // Build entitlement maps
  const entitlementMap = {};
  const allocationsByCenter = {};

  for (const ent of entitlements) {
    entitlementMap[ent.featureKey] = {
      id: ent.id,
      isEnabled: ent.isEnabled,
      totalSeats: ent.totalSeats,
      allocatedTotal: ent.centerAllocations.reduce((sum, ca) => sum + ca.allocatedSeats, 0)
    };

    for (const ca of ent.centerAllocations) {
      if (!allocationsByCenter[ca.centerNodeId]) {
        allocationsByCenter[ca.centerNodeId] = {
          centerId: ca.centerNodeId,
          centerName: ca.centerNode?.name || "Unknown",
          centerCode: ca.centerNode?.code || null,
          centerType: ca.centerNode?.type || null,
          PRACTICE: null,
          ABACUS_PRACTICE: null
        };
      }
      allocationsByCenter[ca.centerNodeId][ent.featureKey] = {
        allocationId: ca.id,
        allocatedSeats: ca.allocatedSeats,
        assignedStudents: ca._count.studentAssignments
      };
    }
  }

  let centerRows = [];
  if (bp?.hierarchyNodeId) {
    const allNodeIds = await resolveHierarchyNodeIdsFromRoot({
      tenantId,
      rootId: bp.hierarchyNodeId
    });

    let scopedNodeIds = allNodeIds;
    if (actorHierarchyNodeIds && actorHierarchyNodeIds.length > 0) {
      scopedNodeIds = allNodeIds.filter((id) => actorHierarchyNodeIds.includes(id));
    }

    centerRows = await prisma.hierarchyNode.findMany({
      where: {
        tenantId,
        id: { in: scopedNodeIds },
        type: { in: ["SCHOOL", "BRANCH"] },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        code: true,
        type: true
      },
      orderBy: { name: "asc" }
    });
  }

  for (const center of centerRows) {
    if (!allocationsByCenter[center.id]) {
      allocationsByCenter[center.id] = {
        centerId: center.id,
        centerName: center.name || "Unknown",
        centerCode: center.code || null,
        centerType: center.type,
        PRACTICE: null,
        ABACUS_PRACTICE: null
      };
    }
  }

  // If franchise, filter to only centers within their hierarchy
  let centers = Object.values(allocationsByCenter);
  if (actorHierarchyNodeIds && actorHierarchyNodeIds.length > 0) {
    centers = centers.filter(c => actorHierarchyNodeIds.includes(c.centerId));
  }

  return {
    entitlements: {
      PRACTICE: entitlementMap.PRACTICE || { id: null, isEnabled: false, totalSeats: 0, allocatedTotal: 0 },
      ABACUS_PRACTICE: entitlementMap.ABACUS_PRACTICE || { id: null, isEnabled: false, totalSeats: 0, allocatedTotal: 0 }
    },
    centers
  };
}

/**
 * Upsert center allocation (BP/Franchise only)
 */
export async function upsertCenterAllocation({
  tenantId,
  businessPartnerId,
  featureKey,
  centerNodeId,
  allocatedSeats,
  actorUserId,
  actorRole,
  actorHierarchyNodeIds // For franchise scope validation
}) {
  // Validate seat count
  if (allocatedSeats < 0) {
    const error = new Error("Allocated seats cannot be negative");
    error.statusCode = 400;
    error.errorCode = "INVALID_SEAT_COUNT";
    throw error;
  }

  // Verify entitlement exists and is enabled
  const entitlement = await prisma.businessPartnerPracticeEntitlement.findUnique({
    where: {
      tenantId_businessPartnerId_featureKey: {
        tenantId,
        businessPartnerId,
        featureKey
      }
    },
    include: {
      centerAllocations: {
        select: {
          id: true,
          centerNodeId: true,
          allocatedSeats: true,
          _count: {
            select: {
              studentAssignments: { where: { isActive: true } }
            }
          }
        }
      }
    }
  });

  if (!entitlement) {
    const error = new Error(`Feature ${featureKey} is not configured for this business partner`);
    error.statusCode = 404;
    error.errorCode = "ENTITLEMENT_NOT_FOUND";
    throw error;
  }

  if (!entitlement.isEnabled) {
    const error = new Error(`Feature ${featureKey} is not enabled for this business partner`);
    error.statusCode = 403;
    error.errorCode = "FEATURE_DISABLED";
    throw error;
  }

  // If franchise, verify center is within their hierarchy scope
  if (actorRole === "FRANCHISE" && actorHierarchyNodeIds && actorHierarchyNodeIds.length > 0) {
    if (!actorHierarchyNodeIds.includes(centerNodeId)) {
      const error = new Error("Cannot allocate seats to centers outside your scope");
      error.statusCode = 403;
      error.errorCode = "CENTER_OUT_OF_SCOPE";
      throw error;
    }
  }

  // Find existing allocation for this center
  const existingAllocation = entitlement.centerAllocations.find(ca => ca.centerNodeId === centerNodeId);

  // Check if reducing below assigned students
  if (existingAllocation && allocatedSeats < existingAllocation._count.studentAssignments) {
    const error = new Error(
      `Cannot reduce allocation to ${allocatedSeats}. Center has ${existingAllocation._count.studentAssignments} students already assigned.`
    );
    error.statusCode = 400;
    error.errorCode = "STUDENTS_ALREADY_ASSIGNED";
    throw error;
  }

  // Calculate total allocated (excluding this center's current allocation if updating)
  const otherAllocations = entitlement.centerAllocations
    .filter(ca => ca.centerNodeId !== centerNodeId)
    .reduce((sum, ca) => sum + ca.allocatedSeats, 0);

  const newTotal = otherAllocations + allocatedSeats;

  if (newTotal > entitlement.totalSeats) {
    const error = new Error(
      `Cannot allocate ${allocatedSeats} seats. Would exceed BP total of ${entitlement.totalSeats} (currently ${otherAllocations} allocated to other centers).`
    );
    error.statusCode = 400;
    error.errorCode = "EXCEEDS_BP_TOTAL";
    throw error;
  }

  // Upsert the allocation
  const allocation = await prisma.centerPracticeAllocation.upsert({
    where: {
      tenantId_entitlementId_centerNodeId: {
        tenantId,
        entitlementId: entitlement.id,
        centerNodeId
      }
    },
    update: {
      allocatedSeats,
      allocatedByUserId: actorUserId,
      allocatedByRole: actorRole,
      updatedAt: new Date()
    },
    create: {
      tenantId,
      entitlementId: entitlement.id,
      centerNodeId,
      allocatedSeats,
      allocatedByUserId: actorUserId,
      allocatedByRole: actorRole
    }
  });

  // Audit
  await recordAudit({
    tenantId,
    userId: actorUserId,
    role: actorRole,
    action: "CENTER_ALLOCATION_UPDATE",
    entityType: "CenterPracticeAllocation",
    entityId: allocation.id,
    metadata: {
      businessPartnerId,
      featureKey,
      centerNodeId,
      allocatedSeats,
      previousSeats: existingAllocation?.allocatedSeats ?? null
    }
  });

  return allocation;
}

// ──────────────────────────────────────────────────────────────────────────────
// Layer 3: Center assigns students
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get center's practice feature status (for Center view)
 */
export async function getCenterPracticeStatus({ tenantId, centerNodeId }) {
  // Find allocations for this center
  const allocations = await prisma.centerPracticeAllocation.findMany({
    where: { tenantId, centerNodeId },
    include: {
      entitlement: {
        select: {
          featureKey: true,
          isEnabled: true
        }
      },
      _count: {
        select: {
          studentAssignments: { where: { isActive: true } }
        }
      }
    }
  });

  const result = {
    PRACTICE: {
      isEnabled: false,
      allocatedSeats: 0,
      assignedStudents: 0,
      remainingSeats: 0
    },
    ABACUS_PRACTICE: {
      isEnabled: false,
      allocatedSeats: 0,
      assignedStudents: 0,
      remainingSeats: 0
    }
  };

  for (const alloc of allocations) {
    const key = alloc.entitlement.featureKey;
    result[key] = {
      allocationId: alloc.id,
      isEnabled: alloc.entitlement.isEnabled,
      allocatedSeats: alloc.allocatedSeats,
      assignedStudents: alloc._count.studentAssignments,
      remainingSeats: alloc.allocatedSeats - alloc._count.studentAssignments
    };
  }

  return result;
}

/**
 * Get student's practice feature assignments
 */
export async function getStudentPracticeAssignments({ tenantId, studentId }) {
  const assignments = await prisma.studentPracticeAssignment.findMany({
    where: { tenantId, studentId, isActive: true },
    select: {
      id: true,
      featureKey: true,
      assignedAt: true
    }
  });

  return {
    PRACTICE: assignments.find(a => a.featureKey === "PRACTICE") || null,
    ABACUS_PRACTICE: assignments.find(a => a.featureKey === "ABACUS_PRACTICE") || null
  };
}

/**
 * Assign practice feature to student (Center only)
 */
export async function assignStudentPracticeFeature({
  tenantId,
  studentId,
  featureKey,
  centerNodeId,
  actorUserId
}) {
  // Verify student belongs to this center
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: centerNodeId }
  });

  if (!student) {
    const error = new Error("Student not found or not under this center");
    error.statusCode = 404;
    error.errorCode = "STUDENT_NOT_FOUND";
    throw error;
  }

  // Check if already assigned
  const existingAssignment = await prisma.studentPracticeAssignment.findUnique({
    where: {
      tenantId_studentId_featureKey: {
        tenantId,
        studentId,
        featureKey
      }
    }
  });

  if (existingAssignment?.isActive) {
    const error = new Error(`Student is already assigned to ${featureKey}`);
    error.statusCode = 409;
    error.errorCode = "ALREADY_ASSIGNED";
    throw error;
  }

  // Find the center's allocation for this feature
  const allocation = await prisma.centerPracticeAllocation.findFirst({
    where: {
      tenantId,
      centerNodeId,
      entitlement: {
        featureKey,
        isEnabled: true
      }
    },
    include: {
      entitlement: {
        select: { featureKey: true, isEnabled: true }
      },
      _count: {
        select: {
          studentAssignments: { where: { isActive: true } }
        }
      }
    }
  });

  if (!allocation) {
    const error = new Error(`Feature ${featureKey} is not available for this center`);
    error.statusCode = 403;
    error.errorCode = "FEATURE_NOT_AVAILABLE";
    throw error;
  }

  // Check seat availability
  if (allocation._count.studentAssignments >= allocation.allocatedSeats) {
    const error = new Error(
      `No seats available. Center has ${allocation.allocatedSeats} seats, all assigned.`
    );
    error.statusCode = 400;
    error.errorCode = "NO_SEATS_AVAILABLE";
    throw error;
  }

  // Create or reactivate assignment
  let assignment;
  if (existingAssignment) {
    // Reactivate
    assignment = await prisma.studentPracticeAssignment.update({
      where: { id: existingAssignment.id },
      data: {
        isActive: true,
        allocationId: allocation.id,
        assignedByUserId: actorUserId,
        assignedAt: new Date(),
        unassignedAt: null,
        unassignedByUserId: null
      }
    });
  } else {
    // Create new
    assignment = await prisma.studentPracticeAssignment.create({
      data: {
        tenantId,
        allocationId: allocation.id,
        studentId,
        featureKey,
        assignedByUserId: actorUserId
      }
    });
  }

  // Audit
  await recordAudit({
    tenantId,
    userId: actorUserId,
    role: "CENTER",
    action: "STUDENT_FEATURE_ASSIGN",
    entityType: "StudentPracticeAssignment",
    entityId: assignment.id,
    metadata: {
      studentId,
      featureKey,
      centerNodeId,
      allocationId: allocation.id
    }
  });

  return assignment;
}

/**
 * Unassign practice feature from student (Center only)
 */
export async function unassignStudentPracticeFeature({
  tenantId,
  studentId,
  featureKey,
  centerNodeId,
  actorUserId
}) {
  // Verify student belongs to this center
  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId, hierarchyNodeId: centerNodeId }
  });

  if (!student) {
    const error = new Error("Student not found or not under this center");
    error.statusCode = 404;
    error.errorCode = "STUDENT_NOT_FOUND";
    throw error;
  }

  // Find active assignment
  const assignment = await prisma.studentPracticeAssignment.findUnique({
    where: {
      tenantId_studentId_featureKey: {
        tenantId,
        studentId,
        featureKey
      }
    }
  });

  if (!assignment || !assignment.isActive) {
    const error = new Error(`Student is not assigned to ${featureKey}`);
    error.statusCode = 404;
    error.errorCode = "NOT_ASSIGNED";
    throw error;
  }

  // Deactivate
  const updated = await prisma.studentPracticeAssignment.update({
    where: { id: assignment.id },
    data: {
      isActive: false,
      unassignedAt: new Date(),
      unassignedByUserId: actorUserId
    }
  });

  // Audit
  await recordAudit({
    tenantId,
    userId: actorUserId,
    role: "CENTER",
    action: "STUDENT_FEATURE_UNASSIGN",
    entityType: "StudentPracticeAssignment",
    entityId: assignment.id,
    metadata: {
      studentId,
      featureKey,
      centerNodeId
    }
  });

  return updated;
}

// ──────────────────────────────────────────────────────────────────────────────
// Student Access Check (for gating practice endpoints)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Check if student has active assignment for a feature
 * Returns true if assigned, false otherwise
 */
export async function checkStudentHasFeature({ tenantId, studentId, featureKey }) {
  try {
    const assignment = await prisma.studentPracticeAssignment.findFirst({
      where: {
        tenantId,
        studentId,
        featureKey,
        isActive: true,
        allocation: {
          entitlement: {
            isEnabled: true
          }
        }
      }
    });

    return Boolean(assignment);
  } catch (error) {
    if (!isSchemaMismatchError(error, ["studentpracticeassignment", "centerpracticeallocation"])) {
      throw error;
    }

    return false;
  }
}

/**
 * Require student has feature - throws 403 if not assigned
 */
export async function requireStudentFeature({ tenantId, studentId, featureKey }) {
  const hasFeature = await checkStudentHasFeature({ tenantId, studentId, featureKey });

  if (!hasFeature) {
    const featureName = featureKey === "PRACTICE" ? "Practice" : "Abacus Practice";
    const error = new Error(
      `You do not have access to ${featureName}. Please contact your center administrator.`
    );
    error.statusCode = 403;
    error.errorCode = "FEATURE_NOT_ASSIGNED";
    throw error;
  }

  return true;
}

// ──────────────────────────────────────────────────────────────────────────────
// For BP/Franchise view of own usage
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Get usage summary for BP/Franchise role (filtered to their scope)
 */
export async function getOwnPracticeUsage({
  tenantId,
  businessPartnerId,
  actorHierarchyNodeIds // For franchise scope filtering
}) {
  // Same as getBPUsageReport but filtered to actor's hierarchy
  const report = await getBPUsageReport({ tenantId, businessPartnerId });

  // If franchise, filter centers
  if (actorHierarchyNodeIds && actorHierarchyNodeIds.length > 0) {
    for (const key of ["PRACTICE", "ABACUS_PRACTICE"]) {
      if (report[key]) {
        report[key].centers = report[key].centers.filter(c =>
          actorHierarchyNodeIds.includes(c.centerId)
        );
        // Recalculate totals for filtered view
        report[key].allocatedSeats = report[key].centers.reduce((sum, c) => sum + c.allocatedSeats, 0);
        report[key].assignedStudents = report[key].centers.reduce((sum, c) => sum + c.assignedStudents, 0);
        report[key].centerCount = report[key].centers.length;
      }
    }
  }

  return report;
}

/**
 * Resolve business partner ID from user context
 * (Helper to support different caller roles)
 */
export async function resolveBusinessPartnerIdForUser({ tenantId, userId, role }) {
  if (role === "BP") {
    const partner = await prisma.businessPartner.findFirst({
      where: {
        tenantId,
        createdByUserId: userId
      },
      select: { id: true }
    });

    if (!partner) {
      // Try via legacy admin pattern
      const authUser = await prisma.authUser.findUnique({
        where: { id: userId },
        select: { email: true }
      });

      if (authUser) {
        const partnerByEmail = await prisma.businessPartner.findFirst({
          where: { tenantId, contactEmail: authUser.email },
          select: { id: true }
        });
        if (partnerByEmail) return partnerByEmail.id;
      }
    }

    return partner?.id || null;
  }

  if (role === "FRANCHISE") {
    const profile = await prisma.franchiseProfile.findFirst({
      where: { tenantId, authUserId: userId },
      select: { businessPartnerId: true }
    });
    return profile?.businessPartnerId || null;
  }

  if (role === "CENTER") {
    const profile = await prisma.centerProfile.findFirst({
      where: { tenantId, authUserId: userId },
      select: {
        franchiseProfile: {
          select: { businessPartnerId: true }
        }
      }
    });
    return profile?.franchiseProfile?.businessPartnerId || null;
  }

  return null;
}
