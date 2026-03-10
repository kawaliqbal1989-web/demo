import { Router } from "express";
import { getMyBranding } from "../controllers/branding.controller.js";

const brandingRouter = Router();

brandingRouter.get("/me", getMyBranding);

export { brandingRouter };
