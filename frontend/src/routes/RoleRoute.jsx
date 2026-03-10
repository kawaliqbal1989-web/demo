import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

function RoleRoute({ allowedRoles = [], requireTenantScope = true }) {
  const location = useLocation();
  const { role, tenantId } = useAuth();

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (requireTenantScope) {
    const tenantFromQuery = new URLSearchParams(location.search).get("tenantId");
    if (tenantFromQuery && tenantId && tenantFromQuery !== tenantId) {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <Outlet />;
}

export { RoleRoute };
