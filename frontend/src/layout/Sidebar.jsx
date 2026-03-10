import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMenuForRole } from "../utils/roleMenu";
import { ROLES } from "../types/auth";
import { resolveAssetUrl } from "../utils/assetUrls";

function Sidebar({ open, onClose }) {
  const { role, branding } = useAuth();
  const menu = getMenuForRole(role);
  const showRoleLogo = [ROLES.BP, ROLES.FRANCHISE, ROLES.CENTER, ROLES.TEACHER, ROLES.STUDENT].includes(role);

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className={`sidebar-overlay ${open ? "sidebar-overlay--visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? "sidebar--open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-title-wrap">
            {showRoleLogo && resolveAssetUrl(branding?.logoUrl) ? (
              <img src={resolveAssetUrl(branding?.logoUrl)} alt="Navigation logo" className="sidebar-brand-logo sidebar-brand-logo--150" />
            ) : null}
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
        {menu.map((item, index) => {
          if (item.section) {
            return (
              <div
                key={`section-${index}`}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#94a3b8",
                  padding: "14px 16px 4px",
                  userSelect: "none"
                }}
              >
                {item.section}
              </div>
            );
          }
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={onClose}
            >
              {item.label}
            </NavLink>
          );
        })}
      </aside>
    </>
  );
}

export { Sidebar };
