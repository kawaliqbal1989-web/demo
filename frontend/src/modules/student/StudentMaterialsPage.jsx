import { useEffect, useState, useMemo } from "react";
import { listStudentMaterials } from "../../services/studentPortalService";

function getTypeIcon(url, title) {
  const lower = (url || title || "").toLowerCase();
  if (lower.includes(".pdf")) return "📄";
  if (lower.includes("youtube") || lower.includes("video") || lower.includes(".mp4")) return "🎬";
  if (lower.includes(".ppt") || lower.includes("slides") || lower.includes("presentation")) return "📊";
  if (lower.includes(".doc") || lower.includes(".docx")) return "📝";
  if (lower.includes(".xls") || lower.includes("sheet")) return "📋";
  if (lower.includes("image") || lower.includes(".png") || lower.includes(".jpg")) return "🖼️";
  return "🔗";
}

function getTypeLabel(url, title) {
  const lower = (url || title || "").toLowerCase();
  if (lower.includes(".pdf")) return "PDF";
  if (lower.includes("youtube") || lower.includes("video") || lower.includes(".mp4")) return "Video";
  if (lower.includes(".ppt") || lower.includes("slides")) return "Slides";
  if (lower.includes(".doc") || lower.includes(".docx")) return "Document";
  if (lower.includes(".xls") || lower.includes("sheet")) return "Spreadsheet";
  return "Link";
}

function StudentMaterialsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    listStudentMaterials()
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setItems(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load materials.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  const types = useMemo(() => {
    const set = new Set(items.map((m) => getTypeLabel(m.url, m.title)));
    return ["all", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          (m.title || "").toLowerCase().includes(q) ||
          (m.description || "").toLowerCase().includes(q)
      );
    }
    if (typeFilter !== "all") {
      list = list.filter((m) => getTypeLabel(m.url, m.title) === typeFilter);
    }
    return list;
  }, [items, search, typeFilter]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>📚 Materials</h2>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 4 }}>
          Links, documents, and resources shared for your level.
        </div>
      </div>

      {error ? <div className="card" style={{ color: "#ef4444" }}>{error}</div> : null}

      {/* Filters */}
      {!loading && items.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            className="input"
            placeholder="🔍 Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, maxWidth: 360 }}
          />
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {types.map((t) => (
              <button
                key={t}
                className={typeFilter === t ? "button" : "button secondary"}
                style={{ width: "auto", fontSize: 12, padding: "4px 10px" }}
                onClick={() => setTypeFilter(t)}
              >
                {t === "all" ? "All" : t}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Stats row */}
      {!loading && items.length > 0 ? (
        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted)" }}>
          <span>Total: {items.length}</span>
          {filtered.length !== items.length ? <span>Showing: {filtered.length}</span> : null}
        </div>
      ) : null}

      {loading ? <div className="card muted">Loading materials…</div> : null}

      {!loading && items.length === 0 ? (
        <div className="card muted" style={{ textAlign: "center", padding: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
          <div style={{ fontWeight: 700 }}>No materials available yet</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Your teacher will share study materials here.</div>
        </div>
      ) : null}

      {!loading && filtered.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
          {filtered.map((m) => {
            const icon = getTypeIcon(m.url, m.title);
            const type = getTypeLabel(m.url, m.title);
            return (
              <div key={m.materialId} className="card" style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ fontSize: 28, lineHeight: 1 }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
                    {m.description ? (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{m.description}</div>
                    ) : null}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: "var(--color-bg-muted)",
                      color: "var(--color-text-muted)",
                      fontWeight: 600
                    }}
                  >
                    {type}
                  </span>
                  <a
                    className="button"
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: "auto", fontSize: 12, padding: "4px 12px", textDecoration: "none" }}
                  >
                    Open →
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {!loading && filtered.length === 0 && items.length > 0 ? (
        <div className="card muted" style={{ textAlign: "center" }}>
          No materials match your search/filter.
        </div>
      ) : null}
    </section>
  );
}

export { StudentMaterialsPage };
