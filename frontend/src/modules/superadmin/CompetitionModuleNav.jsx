import { Link, useLocation } from "react-router-dom";

const competitionModuleNavItems = [
  { key: "legacy", label: "Competition", to: "/superadmin/competition" },
  { key: "foundation-templates", label: "Foundation Templates", to: "/superadmin/competition/foundation/templates" },
  { key: "competition-courses", label: "Competition Courses", to: "/superadmin/competition/courses" }
];

function isActivePath(pathname, to) {
  if (to === "/superadmin/competition") {
    return (
      pathname === to ||
      (pathname.startsWith("/superadmin/competition/") &&
        !pathname.startsWith("/superadmin/competition/foundation/") &&
        !pathname.startsWith("/superadmin/competition/courses"))
    );
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

function CompetitionModuleNav() {
  const location = useLocation();

  return (
    <div className="card" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {competitionModuleNavItems.map((item) => {
        const active = isActivePath(location.pathname, item.to);
        return (
          <Link
            key={item.key}
            to={item.to}
            className={active ? "button" : "button secondary"}
            style={{ width: "auto", textDecoration: "none" }}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

export { CompetitionModuleNav };
