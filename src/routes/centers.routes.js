import { Router } from "express";
import { listCenters } from "../controllers/centers.controller.js";
import { requireRole } from "../middleware/rbac.js";

const centersRouter = Router();

centersRouter.get("/", requireRole("SUPERADMIN", "BP"), listCenters);

export { centersRouter };
