import { memo, useMemo } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMenuForRole } from "../utils/roleMenu";
import { ROLES } from "../types/auth";
import { resolveAssetUrl } from "../utils/assetUrls";

/* Extract leading emoji from a menu label, e.g. "📊 Dashboard" → ["📊", "Dashboard"] */
function splitEmoji(label) {
  const m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
  if (m) return [m[0].trim(), label.slice(m[0].length)];
  return [null, label];
}

const ROLE_ACCENT_MAP = {
  SUPERADMIN: "var(--role-superadmin)",
  BP: "var(--role-bp)",
  FRANCHISE: "var(--role-franchise)",
  CENTER: "var(--role-center)",
  TEACHER: "var(--role-teacher)",
  STUDENT: "var(--role-student)",
  PARENT: "var(--role-parent)",
};

function Sidebar({ open, onClose, collapsed = false }) {
  const { role, branding } = useAuth();
  const menu = useMemo(() => getMenuForRole(role), [role]);
  const showRoleLogo = [ROLES.BP, ROLES.FRANCHISE, ROLES.CENTER, ROLES.TEACHER, ROLES.STUDENT].includes(role);
  const accentColor = ROLE_ACCENT_MAP[role] || "var(--color-primary)";
  const roleBadgeText = collapsed ? role.slice(0, 1) : role;
  const sidebarClassName = `sidebar ${open ? "sidebar--open" : ""} ${collapsed ? "sidebar--collapsed" : ""}`;

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay ${open ? "sidebar-overlay--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={sidebarClassName}>
        {/* Role accent indicator bar */}
        <div className="sidebar-role-indicator" style={{ background: accentColor }} />

        <div className="sidebar-header">
          <div className="sidebar-title-wrap">
            {showRoleLogo && resolveAssetUrl(branding?.logoUrl) ? (
              <img src={resolveAssetUrl(branding?.logoUrl)} alt="Navigation logo" className="sidebar-brand-logo sidebar-brand-logo--150" />
            ) : (
              <img src="/logo.svg" alt="AbacusWeb" className="sidebar-brand-logo sidebar-brand-logo--150" />
            )}
          </div>
          <button
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav">
          {menu.map((item, index) => {
            if (item.section) {
              return (
                <div key={`section-${index}`} className="section-header">
                  <span className="section-header__text">{item.section}</span>
                </div>
              );
            }
            const [emoji, text] = splitEmoji(item.label);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                onClick={onClose}
                aria-label={text}
                data-tooltip={collapsed ? text : undefined}
                title={collapsed ? text : undefined}
              >
                {emoji ? <span className="nav-item__icon">{emoji}</span> : null}
                <span className="nav-item__text">{text}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom role badge */}
        <div style={{ marginTop: "auto", padding: "12px 16px" }}>
          <div className="badge-v2" style={{ background: accentColor, color: "#fff", justifyContent: "center" }}>
            <span className="sidebar-role-text">{roleBadgeText}</span>
          </div>
        </div>
      </aside>
    </>
  );
}

const MemoSidebar = memo(Sidebar);

export { MemoSidebar as Sidebar };
