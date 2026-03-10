import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../../services/apiClient";
import { useAuth } from "../../hooks/useAuth";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function ChangePasswordPage() {
  const navigate = useNavigate();
  const { setMustChangePassword, logout, username } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await apiClient.post("/auth/change-password", {
        currentPassword,
        newPassword
      });

      setMustChangePassword(false);
      // Backend revokes refresh tokens on password change; safest is to logout.
      await logout();
    } catch (err) {
      const message = getFriendlyErrorMessage(err) || "Unable to change password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={onSubmit}>
        <h2>Change Password</h2>
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-label)" }}>
          You must change your password to continue.
        </p>

        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username || ""}
          readOnly
          aria-hidden="true"
          tabIndex={-1}
          style={{
            position: "absolute",
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            border: 0
          }}
        />

        <input
          className="input"
          placeholder="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <input
          className="input"
          placeholder="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />

        {error ? <p className="error">{error}</p> : null}

        <button className="button" disabled={loading}>
          {loading ? "Updating..." : "Update password"}
        </button>

        <button
          type="button"
          className="button secondary"
          onClick={() => navigate("/login", { replace: true })}
          style={{ marginTop: 8 }}
        >
          Back to login
        </button>
      </form>
    </div>
  );
}

export { ChangePasswordPage };
