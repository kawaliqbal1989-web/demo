import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { listUsersByRole, createSuperadminUser } from "../../services/superadminService";

const ROLES = ["", "SUPERADMIN", "BP", "FRANCHISE", "CENTER", "TEACHER", "STUDENT"];
const PAGE_SIZE_OPTIONS = [25, 50, 100];

function SuperadminUsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(() => {
    const raw = Number(searchParams.get("limit") || 50);
    return PAGE_SIZE_OPTIONS.includes(raw) ? raw : 50;
  });
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState(() => searchParams.get("q") || "");
  const [roleFilter, setRoleFilter] = useState(() => searchParams.get("role") || "");

  /* create superadmin form */
  const [showCreate, setShowCreate] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState("");

  const load = async (next = { limit, offset, role: roleFilter, q }) => {
    const nextQ = next.q !== undefined ? String(next.q) : q;
    const nextRole = next.role !== undefined ? next.role : roleFilter;
    const nextLimit = next.limit !== undefined ? next.limit : limit;
    const nextOffset = next.offset !== undefined ? next.offset : offset;

    setLoading(true);
    setError("");
    try {
      const data = await listUsersByRole({
        ...(nextRole ? { role: nextRole } : {}),
        limit: nextLimit,
        offset: nextOffset,
        q: nextQ
      });
      setRows(data.data?.items || data.data || []);
      setTotal(data.data?.total || 0);
      setLimit(nextLimit);
      setOffset(nextOffset);

      const params = {};
      if (nextQ) params.q = nextQ;
      if (nextRole) params.role = nextRole;
      params.limit = String(nextLimit);
      setSearchParams(params, { replace: true });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, role: roleFilter, q });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!createEmail || !createPassword || !createName) return;
    setCreating(true);
    setCreateMsg("");
    setError("");
    try {
      await createSuperadminUser({ email: createEmail, password: createPassword, fullName: createName });
      setCreateMsg("Superadmin created successfully.");
      setCreateEmail("");
      setCreatePassword("");
      setCreateName("");
      setShowCreate(false);
      if (!roleFilter || roleFilter === "SUPERADMIN") await load({ limit, offset, role: roleFilter, q });
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to create superadmin.");
    } finally {
      setCreating(false);
    }
  };

  const isStudentView = roleFilter === "STUDENT";

  const defaultColumns = [
    { key: "username", header: "Username", render: (r) => r.username || "" },
    { key: "email", header: "Email", render: (r) => r.email || "" },
    { key: "role", header: "Role", render: (r) => <StatusBadge status={r.role} /> },
    {
      key: "node",
      header: "Hierarchy Node",
      render: (r) => r.hierarchyNode ? `${r.hierarchyNode.name} (${r.hierarchyNode.code || ""})` : "—"
    },
    {
      key: "isActive",
      header: "Active",
      render: (r) => r.isActive ? "✅" : "❌"
    },
    {
      key: "createdAt",
      header: "Created",
      render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""
    }
  ];

  const studentColumns = [
    { key: "admissionNo", header: "Admission No", render: (r) => r.admissionNo || "" },
    { key: "name", header: "Name", render: (r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "—" },
    { key: "email", header: "Email", render: (r) => r.email || "—" },
    { key: "level", header: "Level", render: (r) => r.level?.name || "—" },
    {
      key: "node",
      header: "Center / Node",
      render: (r) => r.hierarchyNode ? `${r.hierarchyNode.name} (${r.hierarchyNode.code || ""})` : "—"
    },
    { key: "guardian", header: "Guardian", render: (r) => r.guardianName || "—" },
    { key: "phone", header: "Phone", render: (r) => r.phonePrimary || r.guardianPhone || "—" },
    {
      key: "isActive",
      header: "Active",
      render: (r) => r.isActive ? "✅" : "❌"
    },
    {
      key: "createdAt",
      header: "Created",
      render: (r) => r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ""
    }
  ];

  const columns = isStudentView ? studentColumns : defaultColumns;

  if (loading && !rows.length) {
    return <LoadingState label="Loading users..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>User Management</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Browse all users by role</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" type="button" onClick={() => setShowCreate(!showCreate)} style={{ width: "auto" }}>
            {showCreate ? "Cancel" : "+ New Superadmin"}
          </button>
          <button className="button secondary" type="button" onClick={() => void load({ limit, offset, role: roleFilter })} style={{ width: "auto" }}>
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="card"><p className="error" style={{ margin: 0 }}>{error}</p></div>
      ) : null}

      {createMsg ? (
        <div className="card"><p style={{ margin: 0, color: "#059669" }}>{createMsg}</p></div>
      ) : null}

      {showCreate ? (
        <div className="card">
          <h3 style={{ margin: "0 0 8px 0" }}>Create Superadmin</h3>
          <form onSubmit={handleCreate} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Full Name</span>
              <input className="input" value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Full Name" style={{ width: 160 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Email</span>
              <input className="input" type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="Email" style={{ width: 200 }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Password</span>
              <input className="input" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Password" style={{ width: 160 }} />
            </label>
            <button className="button" type="submit" disabled={creating} style={{ width: "auto" }}>
              {creating ? "Creating..." : "Create"}
            </button>
          </form>
        </div>
      ) : null}

      <div className="card" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>Role:</label>
        <select
          className="input"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setOffset(0);
          }}
          style={{ width: 180 }}
        >
          {ROLES.map((r) => (
            <option key={r || "ALL"} value={r}>{r || "ALL"}</option>
          ))}
        </select>
        <label style={{ fontSize: 13, marginLeft: 8 }}>Search:</label>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Username, email..."
          style={{ width: 200 }}
          onKeyDown={(e) => { if (e.key === "Enter") void load({ limit, offset: 0, role: roleFilter, q }); }}
        />
        <button className="button secondary" type="button" onClick={() => void load({ limit, offset: 0, role: roleFilter, q })} style={{ width: "auto" }}>
          Search
        </button>
        <label style={{ fontSize: 13, marginLeft: 8 }}>Rows per page:</label>
        <select
          className="input"
          value={String(limit)}
          onChange={(e) => {
            const nextLimit = Number(e.target.value) || 50;
            void load({ limit: nextLimit, offset: 0, role: roleFilter, q });
          }}
          style={{ width: 110 }}
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={String(opt)}>{opt}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" />
      </div>

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ limit: next.limit, offset: next.offset, role: roleFilter, q });
        }}
      />
    </section>
  );
}

export { SuperadminUsersPage };
