import { Router } from "express";
import { requireRole } from "../middleware/rbac.js";
import { auditAction } from "../middleware/audit-logger.js";
import { genericLogoUpload, wrapUploadMiddleware } from "../middleware/upload.js";
import { deleteLogo, resolveLogoUploadTarget, uploadLogo } from "../controllers/uploads.controller.js";

const uploadsRouter = Router();

uploadsRouter.use(requireRole("FRANCHISE", "CENTER"));

uploadsRouter.post(
  "/logo",
  auditAction("UPLOAD_LOCAL_LOGO", "UPLOAD"),
  resolveLogoUploadTarget,
  wrapUploadMiddleware(genericLogoUpload),
  uploadLogo
);

uploadsRouter.delete(
  "/logo",
  auditAction("DELETE_LOCAL_LOGO", "UPLOAD"),
  resolveLogoUploadTarget,
  deleteLogo
);

export { uploadsRouter };