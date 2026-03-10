import { Router } from "express";
import { listSubmissions } from "../controllers/submissions.controller.js";
import { requireOperationalRoles } from "../middleware/rbac.js";

const submissionsRouter = Router();

submissionsRouter.get("/", requireOperationalRoles(), listSubmissions);

export { submissionsRouter };