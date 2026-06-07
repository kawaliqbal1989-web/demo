import { requireSuperadmin } from "./rbac.js";

const requireAssessmentMigrationAccess = requireSuperadmin();

export { requireAssessmentMigrationAccess };
