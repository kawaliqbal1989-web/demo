import { prisma } from "../lib/prisma.js";

async function resolveHierarchyNodeIdsFromRoot({ tenantId, rootId, tx = prisma }) {
  const normalizedRootId = rootId || null;
  if (!normalizedRootId) {
    return [];
  }

  const visited = new Set([normalizedRootId]);
  let frontier = [normalizedRootId];
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

export { resolveHierarchyNodeIdsFromRoot };
