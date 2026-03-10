/**
 * Practice Allocation Routes
 *
 * Routes for BP/Franchise to manage center seat allocations
 */

import { Router } from "express";
import {
  listCenterAllocations,
  updateCenterAllocation,
  getOwnUsage,
  listAvailableCenters
} from "../controllers/practice-allocation.controller.js";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";

const practiceAllocationRouter = Router();

// All routes require BP or FRANCHISE role
practiceAllocationRouter.use(requireRole("BP", "FRANCHISE"));

// List centers with their allocation state
practiceAllocationRouter.get(
  "/",
  auditAction("VIEW_PRACTICE_ALLOCATIONS", "PRACTICE_ALLOCATION"),
  listCenterAllocations
);

// Get own usage summary
practiceAllocationRouter.get(
  "/usage",
  auditAction("VIEW_OWN_PRACTICE_USAGE", "PRACTICE_ALLOCATION"),
  getOwnUsage
);

// List all available centers (for dropdown)
practiceAllocationRouter.get(
  "/centers",
  listAvailableCenters
);

// Update allocation for a specific center
practiceAllocationRouter.patch(
  "/:centerNodeId",
  auditAction("UPDATE_CENTER_ALLOCATION", "PRACTICE_ALLOCATION", (req) => req.params.centerNodeId),
  updateCenterAllocation
);

export { practiceAllocationRouter };
