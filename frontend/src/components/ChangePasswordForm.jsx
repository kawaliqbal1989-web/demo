import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { changePasswordRequest } from "../services/authService";
import { getFriendlyErrorMessage } from "../utils/apiErrors";

function ChangePasswordForm({
  className,
  style,
  title = "Change Password",
  description,
  submitLabel = "Update password",
  cancelLabel,
  onCancel
}) {
  const { setMustChangePassword, logout, username, isAuthenticated } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event) => {
    event.preventDefault();

    if (!isAuthenticated) {
      setError("Your session expired. Please log in again.");
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("Please fill all password fields.");
      return;
    }

    if (String(newPassword).length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      await changePasswordRequest({
        currentPassword,
        newPassword
      });

      setMustChangePassword(false);
      setLoading(false);
      await logout();
      return;
    } catch (err) {
      const message = getFriendlyErrorMessage(err) || "Unable to change password.";
      setError(message);
    }

    setLoading(false);
  };

  return (
    <form className={className} style={style} onSubmit={onSubmit}>
      {title ? <h2 style={{ margin: 0 }}>{title}</h2> : null}
      {description ? (
        <p style={{ margin: 0, fontSize: 14, color: "var(--color-text-label)" }}>
          {description}
        </p>
      ) : null}

      {!isAuthenticated ? (
        <p className="error" style={{ margin: 0 }}>
          Your session expired. Please log in again.
        </p>
      ) : null}

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

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Current password</span>
        <input
          className="input"
          placeholder="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>New password</span>
        <input
          className="input"
          placeholder="New password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </label>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Confirm new password</span>
        <input
          className="input"
          placeholder="Confirm new password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
      </label>

      <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)" }}>
        You will be signed out after the password is changed.
      </p>

      {error ? (
        <p className="error" role="alert" style={{ margin: 0 }}>
          {error}
        </p>
      ) : null}

      <button className="button" disabled={loading || !isAuthenticated}>
        {loading ? "Updating..." : submitLabel}
      </button>

      {cancelLabel && onCancel ? (
        <button type="button" className="button secondary" onClick={onCancel}>
          {cancelLabel}
        </button>
      ) : null}
    </form>
  );
}

export { ChangePasswordForm };