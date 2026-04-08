import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getStoredMustChangePassword } from "../auth/sessionStorage";
import { LoadingState } from "../components/LoadingState";

function ProtectedRoute() {
  const { isAuthenticated, mustChangePassword, authBootstrapPending } = useAuth();
  const location = useLocation();
  const requiresPasswordChange = mustChangePassword || getStoredMustChangePassword();

  if (authBootstrapPending) {
    return <LoadingState label="Loading session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (requiresPasswordChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

export { ProtectedRoute };
