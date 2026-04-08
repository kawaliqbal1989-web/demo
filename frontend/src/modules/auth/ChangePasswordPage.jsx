import { useNavigate } from "react-router-dom";
import { ChangePasswordForm } from "../../components/ChangePasswordForm";
import { useAuth } from "../../hooks/useAuth";
import { ROLES } from "../../types/auth";

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
      return "/login";
  }
}

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { isAuthenticated, mustChangePassword, role } = useAuth();

  const requiresPasswordChange = Boolean(mustChangePassword);
  const cancelTarget = requiresPasswordChange || !isAuthenticated ? "/login" : getHomeForRole(role);
  const cancelLabel = requiresPasswordChange || !isAuthenticated ? "Back to login" : "Back to dashboard";
  const description = requiresPasswordChange
    ? "You must change your password to continue."
    : "Update your password and sign back in with the new credentials.";

  return (
    <div className="auth-page">
      <ChangePasswordForm
        className="auth-form"
        style={{ display: "grid", gap: 12 }}
        description={description}
        cancelLabel={cancelLabel}
        onCancel={() => navigate(cancelTarget, { replace: true })}
      />
    </div>
  );
}

export { ChangePasswordPage };
