import { useEffect, useState, useCallback } from "react";
import { useAuth } from "../hooks/useAuth";
import { NotificationBell } from "../components/NotificationBell";
import { CommandPalette } from "../components/CommandPalette";
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
  const [cmdOpen, setCmdOpen] = useState(false);
  const showRoleLogo = [ROLES.BP, ROLES.FRANCHISE, ROLES.CENTER, ROLES.TEACHER, ROLES.STUDENT].includes(role);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    setStoredTheme(theme);
  }, [theme]);

  /* Global Ctrl+K shortcut */
  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      setCmdOpen((v) => !v);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const isDark = theme === "dark";

  return (
    <>
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

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Ctrl+K search trigger */}
          <button className="topbar-search-trigger" onClick={() => setCmdOpen(true)} title="Search pages (Ctrl+K)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span className="topbar-hide-mobile" style={{ fontSize: 13 }}>Search…</span>
            <kbd className="topbar-hide-mobile" style={{ fontSize: 11, opacity: 0.6, marginLeft: 4, padding: "1px 5px", borderRadius: 4, border: "1px solid var(--color-border)" }}>⌘K</kbd>
          </button>

          {tenantId && tenantId !== "tenant_default" ? (
            <span className="topbar-hide-mobile user-info">{tenantId}</span>
          ) : null}
          <span className="topbar-hide-mobile user-info">{displayName || username || "No User"}</span>

          <NotificationBell />

          {/* Theme toggle icon button */}
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>

          <button className="button secondary" style={{ width: "auto", padding: "6px 14px", fontSize: 13 }} onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </>
  );
}

export { Topbar };
