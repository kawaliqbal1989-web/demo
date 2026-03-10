import { prisma } from "../lib/prisma.js";

async function resolveBusinessPartnerHierarchyNodeIds({ tenantId, businessPartnerId, tx = prisma }) {
  const partner = await tx.businessPartner.findFirst({
    where: {
      id: businessPartnerId,
      tenantId
    },
    select: {
      hierarchyNodeId: true
    }
  });

  const rootId = partner?.hierarchyNodeId || null;
  if (!rootId) {
    return [];
  }

  const visited = new Set([rootId]);
  let frontier = [rootId];
  let safety = 0;

  while (frontier.length && safety < 50) {
    // eslint-disable-next-line no-await-in-loop
    const children = await tx.hierarchyNode.findMany({
      where: {
        tenantId,
        parentId: { in: frontier }
      },
      select: { id: true }
    });

    const next = [];
    for (const child of children) {
      if (!visited.has(child.id)) {
        visited.add(child.id);
        next.push(child.id);
      }
    }

    frontier = next;
    safety += 1;
  }

  return Array.from(visited);
}

async function cascadeSetBusinessPartnerActiveState({ tx, tenantId, businessPartnerId, isActive }) {
  const hierarchyNodeIds = await resolveBusinessPartnerHierarchyNodeIds({ tenantId, businessPartnerId, tx });

  if (hierarchyNodeIds.length) {
    await tx.hierarchyNode.updateMany({
      where: {
        tenantId,
        id: { in: hierarchyNodeIds }
      },
      data: {
        isActive
      }
    });

    await tx.authUser.updateMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds },
        role: { in: ["BP", "FRANCHISE", "CENTER", "TEACHER"] }
      },
      data: {
        isActive,
        ...(isActive
          ? { lockUntil: null, failedAttempts: 0 }
          : { lockUntil: null, failedAttempts: 0 })
      }
    });

    await tx.student.updateMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds }
      },
      data: {
        isActive
      }
    });

    const students = await tx.student.findMany({
      where: {
        tenantId,
        hierarchyNodeId: { in: hierarchyNodeIds }
      },
      select: { id: true }
    });

    if (students.length) {
      await tx.authUser.updateMany({
        where: {
          tenantId,
          studentId: { in: students.map((s) => s.id) },
          role: "STUDENT"
        },
        data: {
          isActive,
          ...(isActive
            ? { lockUntil: null, failedAttempts: 0 }
            : { lockUntil: null, failedAttempts: 0 })
        }
      });
    }
  }

  return { hierarchyNodeIds };
}

export { cascadeSetBusinessPartnerActiveState, resolveBusinessPartnerHierarchyNodeIds };
