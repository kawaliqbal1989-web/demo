import { Link } from "react-router-dom";

const OPTIONS = [
  {
    title: "Classic Abacus",
    badge: "CLASSIC",
    description: "Use the complete Virtual Abacus freely for bead practice and number exploration.",
    path: "/student/virtual-abacus/classic",
    action: "Open Classic Abacus"
  },
  {
    title: "Practice & Learn",
    badge: "LEARN",
    description: "Continue the existing guided learning, number building, reading, hints and speed practice.",
    path: "/student/virtual-abacus/learn",
    action: "Start Practice & Learn"
  },
  {
    title: "Abacus Arena",
    badge: "NEW",
    description: "A separate training world for Flash Cards, Display Dictation, Audio Dictation, Smart Coach, progress and challenges.",
    path: "/student/virtual-abacus/arena",
    action: "Enter Abacus Arena"
  }
];

function StudentVirtualAbacusHubPage({ basePath = "/student/virtual-abacus" } = {}) {
  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Virtual Abacus</h1>
          <div className="muted">
            Choose how you want to learn, practise or challenge yourself.
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16
        }}
      >
        {OPTIONS.map((option) => (
          <div
            className="card"
            key={option.path}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              minHeight: 220
            }}
          >
            <div>
              <span className="muted">{option.badge}</span>
              <h2 style={{ marginBottom: 8 }}>{option.title}</h2>
              <div className="muted">{option.description}</div>
            </div>

            <Link
              className="button"
              to={option.path.replace("/student/virtual-abacus", basePath)}
              style={{
                marginTop: "auto",
                textAlign: "center"
              }}
            >
              {option.action}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

export { StudentVirtualAbacusHubPage };
