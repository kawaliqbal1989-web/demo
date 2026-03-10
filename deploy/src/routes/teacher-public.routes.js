import { Router } from "express";
import { teacherLogin } from "../controllers/teacher-portal.controller.js";
import { authRateLimiter } from "../middleware/auth-rate-limit.js";

const teacherPublicRouter = Router();

teacherPublicRouter.post("/login", authRateLimiter, teacherLogin);

export { teacherPublicRouter };
