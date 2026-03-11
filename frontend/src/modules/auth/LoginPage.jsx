import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState({ username: false, password: false });

  const usernameError = !username.trim() ? "Username is required." : "";
  const passwordError = !password.trim() ? "Password is required." : "";

  const onSubmit = async (event) => {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");

    setTouched({ username: true, password: true });

    if (!username.trim() || !password.trim()) {
      setError("Enter username and password.");
      return;
    }

    try {
      const result = await login({ username, password });
      navigate(result?.mustChangePassword ? "/change-password" : "/", { replace: true });
    } catch (e) {
      const status = e?.response?.status;
      const errorCode = e?.response?.data?.error_code;

      if (status === 423 || errorCode === "ACCOUNT_LOCKED") {
        setError("Account temporarily locked. Try again in 15 minutes.");
      } else if (status === 429 || errorCode === "AUTH_RATE_LIMITED") {
        setError("Too many login attempts. Please try again later.");
      } else if (status === 401 || errorCode === "INVALID_CREDENTIALS") {
        setError("Invalid username or password.");
      } else {
        setError("Login failed. Please try again.");
      }
    }
  };

  return (
    <div className="auth-page login-page">
      <div className="login-grid">
        <div className="login-panel login-panel--right">
          <div className="login-form">
            <div className="login-form-header">
              <div className="login-logo login-logo--small" aria-hidden="true">
                AW
              </div>
              <div>
                <div className="login-title">Welcome back</div>
                <div className="login-subtitle">Sign in to AbacusWeb</div>
              </div>
            </div>

            <form className="login-form-body" onSubmit={onSubmit} noValidate>
              <div className="login-field">
                <label htmlFor="username" className="login-label">
                  Username
                </label>
                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    id="username"
                    name="username"
                    className="input login-input"
                    placeholder="Enter username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toUpperCase())}
                    onBlur={() => setTouched((t) => ({ ...t, username: true }))}
                    aria-invalid={Boolean(touched.username && usernameError)}
                  />
                </div>
                {touched.username && usernameError ? (
                  <div className="login-field-error" role="alert">
                    {usernameError}
                  </div>
                ) : null}
              </div>

              <div className="login-field">
                <label htmlFor="password" className="login-label">
                  Password
                </label>
                <div className="login-input-wrap">
                  <span className="login-input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17 11V7a5 5 0 0 0-10 0v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="M7 11h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    name="password"
                    className="input login-input login-password-input"
                    placeholder="••••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                    aria-invalid={Boolean(touched.password && passwordError)}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    <span className="login-eye" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </span>
                  </button>
                </div>
                {touched.password && passwordError ? (
                  <div className="login-field-error" role="alert">
                    {passwordError}
                  </div>
                ) : null}
              </div>

              <div className="login-status" aria-live="polite">
                {error ? <p className="error">{error}</p> : null}
              </div>

              <button
                className="button login-primary"
                disabled={loading || !username.trim() || !password.trim()}
              >
                {loading ? "Signing in..." : "Log in"}
              </button>
            </form>
          </div>
        </div>

        <div className="login-panel login-panel--left">
          <div className="login-hero">
            <div className="login-hero-logo" aria-hidden="true">
              AW
            </div>
            <h1 className="login-hero-title">Master mental math with the abacus</h1>
            <p className="login-hero-subtitle">
              The all-in-one platform for abacus centers, teachers, and students — structured courses, worksheets, and progress tracking.
            </p>

            <div className="login-badges" aria-label="Key statistics">
              <div className="login-badge">
                <div className="login-badge-value">6 Roles</div>
                <div className="login-badge-label">One platform</div>
              </div>
              <div className="login-badge">
                <div className="login-badge-value">Levels</div>
                <div className="login-badge-label">Structured curriculum</div>
              </div>
              <div className="login-badge">
                <div className="login-badge-value">Live</div>
                <div className="login-badge-label">Results &amp; analytics</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { LoginPage };
