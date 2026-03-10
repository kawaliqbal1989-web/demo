import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ROLES } from "../types/auth";

function getHomeForRole(role) {
  switch (role) {
    case ROLES.SUPERADMIN:
      return "/superadmin/dashboard";
    case ROLES.BP:
      return "/bp/overview";
    case ROLES.FRANCHISE:
      return "/franchise/overview";
    case ROLES.CENTER:
      return "/center/dashboard";
    case ROLES.TEACHER:
      return "/teacher/dashboard";
    case ROLES.STUDENT:
      return "/student/dashboard";
    default:
      return "/unauthorized";
  }
}

function IndexRedirect() {
  const { role, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={getHomeForRole(role)} replace />;
}

export { IndexRedirect };
