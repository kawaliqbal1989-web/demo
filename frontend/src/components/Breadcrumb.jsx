import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const ROLE_PREFIX = {
  SUPERADMIN: "/superadmin",
  BP: "/bp",
  FRANCHISE: "/franchise",
  CENTER: "/center",
  TEACHER: "/teacher",
  STUDENT: "/student",
};

const LABEL_MAP = {
  superadmin: "Superadmin",
  bp: "Partner",
  franchise: "Franchise",
  center: "Center",
  teacher: "Teacher",
  student: "Student",
  dashboard: "Dashboard",
  analytics: "Analytics",
  reports: "Reports",
  students: "Students",
  teachers: "Teachers",
  batches: "Batches",
  enrollments: "Enrollments",
  attendance: "Attendance",
  worksheets: "Worksheets",
  courses: "Courses",
  "exam-cycles": "Exam Cycles",
  "mock-tests": "Mock Tests",
  exams: "Exams",
  results: "Results",
  notes: "Notes",
  profile: "Profile",
  "abuse-flags": "Abuse Flags",
  "audit-logs": "Audit Logs",
  revenue: "Revenue",
  subscriptions: "Subscriptions",
  margins: "Margins",
  settlements: "Settlements",
  ledger: "Ledger",
  users: "Users",
  certificates: "Certificates",
  hierarchy: "Hierarchy",
  competition: "Competition",
  "competition-requests": "Competition Requests",
  franchises: "Franchises",
  centers: "Centers",
  "business-partners": "Business Partners",
  "practice-features": "Practice Features",
  "practice-allocations": "Practice Allocations",
  "revenue-split": "Revenue Split",
  "certificate-template": "Certificate Template",
  notifications: "Notifications",
  "change-password": "Change Password",
  materials: "Materials",
  "my-course": "My Course",
  practice: "Practice",
  "abacus-practice": "Abacus Practice",
  "virtual-abacus": "Virtual Abacus",
  "ai-playground": "AI Playground",
  progress: "Progress",
  leaderboard: "Leaderboard",
  fees: "Fees",
  "weak-topics": "Weak Topics",
  "attendance-history": "Attendance History",
  "reassignment-requests": "Reassignment Queue",
  "practice-assignments": "Practice Assignments",
  "360": "Student 360",
  "assign-worksheets": "Assign Worksheets",
  "change-teacher": "Change Teacher",
  pending: "Pending",
  overview: "Dashboard",
};

/* Build breadcrumb from current path; skip dynamic :id segments that look like raw IDs */
function isIdSegment(seg) {
  return /^\d+$/.test(seg) || /^[0-9a-f-]{20,}$/i.test(seg);
}

function Breadcrumb({ items }) {
  const location = useLocation();
  const { role } = useAuth();

  /* If explicit items are passed, use them; otherwise auto-derive from URL */
  const crumbs = items || deriveFromPath(location.pathname, role);

  if (!crumbs || crumbs.length <= 1) return null;

  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {crumbs.map((crumb, idx) => {
        const isLast = idx === crumbs.length - 1;
        return (
          <span key={`${crumb.path || crumb.label}-${idx}`} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {idx > 0 && <span className="breadcrumb__sep">›</span>}
            {isLast ? (
              <span className="breadcrumb__current">{crumb.label}</span>
            ) : (
              <Link to={crumb.path}>{crumb.label}</Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function deriveFromPath(pathname, role) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const rolePrefix = ROLE_PREFIX[role];
  const dashboardPath = rolePrefix ? `${rolePrefix}/dashboard` : "/";

  const crumbs = [{ label: "Home", path: dashboardPath }];

  let accum = "";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    accum += `/${seg}`;

    if (isIdSegment(seg)) continue; /* skip IDs */
    if (crumbs.some((crumb) => crumb.path === accum)) continue;

    const label = LABEL_MAP[seg] || seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    crumbs.push({ label, path: accum });
  }

  return crumbs;
}

export { Breadcrumb };
