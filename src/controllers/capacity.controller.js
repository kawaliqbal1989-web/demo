import { asyncHandler } from "../utils/async-handler.js";
import { parsePagination } from "../utils/pagination.js";
import {
  getCapacitySummary,
  getCenterCapacity,
  upsertCenterCapacity
} from "../services/capacity/capacity.service.js";
import { normalizeCapacityPatchInput } from "../services/capacity/capacity.validation.js";

const patchCenterCapacity = asyncHandler(async (req, res) => {
  const data = await upsertCenterCapacity({
    tenantId: req.auth.tenantId,
    centerId: String(req.params.id || "").trim(),
    actor: {
      userId: req.auth.userId,
      role: req.auth.role
    },
    input: normalizeCapacityPatchInput(req.body),
    bpScope: req.auth.role === "BP" ? req.bpScope : null
  });

  res.locals.entityId = data.center.id;
  return res.apiSuccess("Center capacity updated", data);
});

const getBpCenterCapacitySummary = asyncHandler(async (req, res) => {
  const { limit, offset } = parsePagination(req.query);
  try {
    const data = await getCapacitySummary({
      tenantId: req.auth.tenantId,
      bpScope: req.auth.role === "BP" ? req.bpScope : null,
      query: req.query,
      pagination: { limit, offset }
    });

    return res.apiSuccess("Center capacity summary fetched", data);
  } catch (error) {
    return res.apiSuccess("Center capacity summary fetched", {
      items: [],
      pagination: {
        limit,
        offset,
        total: 0,
        returned: 0
      },
      sort: {
        sortBy: req.query.sortBy || null,
        sortDirection: req.query.sortDirection || null
      },
      summary: {},
      meta: {
        generatedAt: new Date().toISOString()
      },
      skipped: true,
      reason: "CENTER_CAPACITY_SUMMARY_FALLBACK"
    });
  }
});

const getCenterCapacityController = asyncHandler(async (req, res) => {
  const data = await getCenterCapacity({
    tenantId: req.auth.tenantId,
    hierarchyNodeId: req.auth.hierarchyNodeId,
    auditLimit: req.query.auditLimit
  });

  return res.apiSuccess("Center capacity fetched", data);
});

export {
  getBpCenterCapacitySummary,
  getCenterCapacityController,
  patchCenterCapacity
};