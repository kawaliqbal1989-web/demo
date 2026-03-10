import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";

const listSubmissions = asyncHandler(async (req, res) => {
  const { take, skip, orderBy } = parsePagination(req.query);
  const { role, tenantId, hierarchyNodeId } = req.auth;

  const where = {
    tenantId
  };

  if (role === "CENTER" || role === "TEACHER") {
    where.student = { hierarchyNodeId };
  } else if (role === "FRANCHISE" || role === "BP") {
    const descendants = await prisma.hierarchyNode.findMany({
      where: { tenantId, path: { contains: hierarchyNodeId } },
      select: { id: true },
      take: 5000
    });
    const nodeIds = descendants.map((n) => n.id);
    if (nodeIds.length) {
      where.student = { hierarchyNodeId: { in: nodeIds } };
    } else {
      return res.apiSuccess("Submissions fetched", []);
    }
  }

  const data = await prisma.worksheetSubmission.findMany({
    where,
    orderBy,
    skip,
    take,
    select: {
      id: true,
      tenantId: true,
      worksheetId: true,
      studentId: true,
      score: true,
      status: true,
      submittedAt: true,
      createdAt: true,
      finalSubmittedAt: true,
      passed: true,
      remarks: true,
      student: {
        select: {
          id: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          hierarchyNodeId: true,
          levelId: true
        }
      },
      worksheet: {
        select: {
          id: true,
          title: true,
          levelId: true,
          difficulty: true
        }
      }
    }
  });

  return res.apiSuccess("Submissions fetched", data);
});

export { listSubmissions };