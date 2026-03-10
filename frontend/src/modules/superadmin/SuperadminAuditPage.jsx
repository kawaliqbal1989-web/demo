import { useEffect, useMemo, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listAuditLogs } from "../../services/auditLogsService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { ROLES } from "../../types/auth";

function toIsoDateOnly(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimestamp(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function SuperadminAuditPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [role, setRole] = useState("");
  const [action, setAction] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const queryParams = useMemo(() => {
    const params = {
      limit,
      offset
    };

    if (from) {
      params.from = from;
    }

    if (to) {
      params.to = to;
    }

    if (role) {
      params.role = role;
    }

    if (action) {
      params.action = action;
    }

    return params;
  }, [limit, offset, from, to, role, action]);

  const load = async (nextParams = queryParams) => {
    setLoading(true);
    setError("");
    try {
      const data = await listAuditLogs(nextParams);
      setRows(data.data.items || []);
      setTotal(data.data.total || 0);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(queryParams);
  }, []);

  const columns = [
    { key: "createdAt", header: "Created", render: (r) => formatTimestamp(r.createdAt) },
    { key: "tenantId", header: "Tenant" },
    { key: "action", header: "Action" },
    { key: "actorRole", header: "Role" },
    { key: "actorUserId", header: "User" },
    { key: "targetEntityType", header: "Entity" },
    { key: "targetEntityId", header: "Entity ID" },
    {
      key: "metadata",
      header: "Metadata",
      render: (r) => (
        <details>
          <summary style={{ cursor: "pointer", color: "#2563eb" }}>View</summary>
          <pre style={{ whiteSpace: "pre-wrap", margin: 0, paddingTop: 8, maxWidth: 520 }}>
            {JSON.stringify(r.metadata, null, 2)}
          </pre>
        </details>
      )
    }
  ];

  if (loading && !rows.length) {
    return <LoadingState label="Loading audit logs..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Audit Logs</h2>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>From</label>
            <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>To</label>
            <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All</option>
              {Object.values(ROLES).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Action</label>
            <input className="input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. SUBSCRIPTION_RENEWAL" />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => {
              setFrom("");
              setTo("");
              setRole("");
              setAction("");
              setOffset(0);
              void load({ limit, offset: 0 });
            }}
          >
            Clear
          </button>
          <button
            className="button"
            style={{ width: "auto" }}
            disabled={loading}
            onClick={() => {
              setOffset(0);
              void load({ ...queryParams, offset: 0 });
            }}
          >
            {loading ? "Loading..." : "Apply"}
          </button>
        </div>

        {error ? <p className="error" style={{ margin: 0 }}>{error}</p> : null}
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total: {total}</div>
      </div>

      <DataTable columns={columns} rows={rows} keyField="id" />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        total={total}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ ...queryParams, ...next });
        }}
      />
    </section>
  );
}

export { SuperadminAuditPage };
