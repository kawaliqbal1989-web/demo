import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listUsersByRole } from "../../services/usersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { StatusBadge } from "../../components/StatusBadge";

function SuperadminCentersPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [franchises, setFranchises] = useState([]);
  const [franchiseId, setFranchiseId] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = async (next = { limit, offset, q, status, parentId: franchiseId }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listUsersByRole("CENTER", next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load centers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function loadFranchises() {
      try {
        const data = await listUsersByRole("FRANCHISE", { limit: 200, offset: 0, status: "ACTIVE" });
        const items = data?.data?.items || [];
        if (!cancelled) {
          setFranchises(items);
        }
      } catch {
        if (!cancelled) {
          setFranchises([]);
        }
      }
    }

    void loadFranchises();
    // Load centers initially (no franchise filter) so superadmins can view/search all centers
    void load({ limit, offset, q, status });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading centers..." />;
  }

  const handleSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status, parentId: franchiseId || undefined });
  };

  const handleRefresh = () => {
    void load({ limit, offset, q, status, parentId: franchiseId || undefined });
  };

  const handleSelectFranchise = (nextId) => {
    setFranchiseId(nextId);
    setOffset(0);
    setRows([]);
    setError("");
    if (nextId) {
      void load({ limit, offset: 0, q, status, parentId: nextId });
    }
  };

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    setOffset(0);
    if (!franchiseId) {
      return;
    }
    void load({ limit, offset: 0, q, status: nextStatus, parentId: franchiseId });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Center / School List</h2>
        <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
          Review centers under your franchise.
        </p>
      </div>
      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select
            className="select"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>

          <select
            className="select"
            value={franchiseId}
            onChange={(e) => handleSelectFranchise(e.target.value)}
            style={{ width: 220 }}
          >
            <option value="">Select Franchise</option>
            {franchises.map((f) => (
              <option key={f.id} value={f.hierarchyNodeId || ""}>
                {(f.hierarchyNode?.code || f.username || "").trim()} {f.hierarchyNode?.name ? `- ${f.hierarchyNode.name}` : ""}
              </option>
            ))}
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }} disabled={!franchiseId}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={handleRefresh} style={{ width: "auto" }} disabled={!franchiseId}>
          Refresh
        </button>
      </div>

      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
        {franchiseId ? (
          <span>Viewing centers for selected franchise.</span>
        ) : (
          <span>Viewing all centers. Select a franchise to filter results.</span>
        )}
      </div>

      <DataTable
        columns={[
          {
            key: "code",
            header: "Code",
            render: (r) => r?.hierarchyNode?.code || r?.username || ""
          },
          { key: "username", header: "Username" },
          {
            key: "name",
            header: "Name",
            render: (r) => r?.hierarchyNode?.name || ""
          },
          {
            key: "franchise",
            header: "Franchise",
            render: (r) => {
              const parent = r?.hierarchyNode?.parent;
              const code = parent?.code ? String(parent.code) : "";
              const name = parent?.name ? String(parent.name) : "";
              if (code && name) return `${code} / ${name}`;
              return name || code || "";
            }
          },
          {
            key: "partner",
            header: "Partner",
            render: (r) => {
              const partner = r?.hierarchyNode?.parent?.parent;
              const code = partner?.code ? String(partner.code) : "";
              const name = partner?.name ? String(partner.name) : "";
              if (code && name) return `${code} / ${name}`;
              return name || code || "";
            }
          },
          {
            key: "status",
            header: "Status",
            render: (r) => {
              const active = r?.hierarchyNode?.isActive;
              return <StatusBadge value={active === false ? "INACTIVE" : "ACTIVE"} />;
            }
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => {
              const bpNode = r?.hierarchyNode?.parent?.parent;
              const bpId = bpNode?.businessPartner?.id;
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  {bpId ? (
                    <Link to={`/superadmin/business-partners/${bpId}`} className="button secondary" style={{ width: "auto", fontSize: 12, padding: "2px 8px", textDecoration: "none" }}>
                      View BP
                    </Link>
                  ) : null}
                </div>
              );
            }
          }
        ]}
        rows={rows}
        keyField="id"
      />

      <PaginationBar
        limit={limit}
        offset={offset}
        count={rows.length}
        onChange={(next) => {
          setLimit(next.limit);
          setOffset(next.offset);
          void load({ ...next, q, status, parentId: franchiseId || undefined });
        }}
      />
    </section>
  );
}

export { SuperadminCentersPage };