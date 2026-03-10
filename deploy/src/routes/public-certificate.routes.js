import { Router } from "express";
import { verifyCertificate } from "../controllers/public-certificate.controller.js";

const publicCertificateRouter = Router();

publicCertificateRouter.get("/verify/:token", verifyCertificate);

export { publicCertificateRouter };
