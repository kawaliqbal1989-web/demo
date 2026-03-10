import { Router } from "express";
import { requireOperationalRoles } from "../middleware/rbac.js";
import { listCatalogCourseLevels, listCatalogCourses } from "../controllers/catalog.controller.js";

const catalogRouter = Router();

catalogRouter.use(requireOperationalRoles());

catalogRouter.get("/courses", listCatalogCourses);
catalogRouter.get("/courses/:courseId/levels", listCatalogCourseLevels);

export { catalogRouter };
