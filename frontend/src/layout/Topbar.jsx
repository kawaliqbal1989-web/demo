import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { NotificationBell } from "../components/NotificationBell";
import { ROLES } from "../types/auth";
import { resolveAssetUrl } from "../utils/assetUrls";

const THEME_KEY = "abacus_theme";

function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || "light";
  } catch {
    return "light";
  }
}

function setStoredTheme(value) {
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    // ignore
  }
}

function Topbar({ onToggleSidebar }) {
  const { role, tenantId, username, logout, branding, displayName } = useAuth();
  const [theme, setTheme] = useState(() => getStoredTheme());
  const showRoleLogo = [ROLES.BP, ROLES.FRANCHISE, ROLES.CENTER, ROLES.TEACHER, ROLES.STUDENT].includes(role);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setStoredTheme(theme);
  }, [theme]);

  return (
    <header className="topbar">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button
          className="sidebar-hamburger"
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        {showRoleLogo && resolveAssetUrl(branding?.logoUrl) ? (
          <img
            src={resolveAssetUrl(branding?.logoUrl)}
            alt="Business partner logo"
            className="topbar-brand-logo topbar-brand-logo--75"
          />
        ) : null}
        <strong className="brand-title">{branding?.displayName || branding?.name || "AbacusWeb"}</strong>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {tenantId && tenantId !== "tenant_default" ? (
          <span className="topbar-hide-mobile user-info">{tenantId}</span>
        ) : null}
        <span className="topbar-hide-mobile user-info">{displayName || username || "No User"}</span>
        <span className="topbar-hide-mobile user-info">{role || "No Role"}</span>
        <NotificationBell />
        <button
          className="button secondary"
          style={{ width: "auto" }}
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        >
          Toggle theme
        </button>
        <button className="button secondary" style={{ width: "auto" }} onClick={logout}>
          Logout
        </button>
      </div>
    </header>
  );
}

export { Topbar };
