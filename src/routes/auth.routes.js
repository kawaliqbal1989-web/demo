import { Router } from "express";
import {
	changePassword,
	login,
	me,
	logout,
	refresh,
	resetPassword
} from "../controllers/auth.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { authRateLimiter } from "../middleware/auth-rate-limit.js";
import { enforceHierarchyResetRule } from "../middleware/enforce-hierarchy-reset-rule.js";

const authRouter = Router();

authRouter.post("/login", authRateLimiter, login);
authRouter.get("/me", authenticate, me);
authRouter.post("/refresh", refresh);
authRouter.post("/logout", authenticate, logout);
authRouter.post("/change-password", authenticate, changePassword);
authRouter.post(
	"/reset-password",
	authenticate,
	enforceHierarchyResetRule,
	resetPassword
);

export { authRouter };
