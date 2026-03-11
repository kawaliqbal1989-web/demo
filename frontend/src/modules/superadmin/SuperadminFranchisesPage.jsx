import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { SkeletonLoader } from "../../components/SkeletonLoader";
import { PageHeader } from "../../components/PageHeader";
import { listUsersByRole } from "../../services/usersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { StatusBadge } from "../../components/StatusBadge";

function SuperadminFranchisesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const [partners, setPartners] = useState([]);
  const [partnerId, setPartnerId] = useState("");

  const load = async (next = { limit, offset, q, status }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listUsersByRole("FRANCHISE", next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load franchises.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPartners() {
      try {
        const data = await listUsersByRole("BP", { limit: 200, offset: 0, status: "ACTIVE" });
        const items = data?.data?.items || [];
        if (!cancelled) {
          setPartners(items);
        }
      } catch {
        if (!cancelled) {
          setPartners([]);
        }
      }
    }

    void loadPartners();
    void load({ limit, offset, q, status });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading && !rows.length) {
    return <SkeletonLoader variant="table" rows={6} />;
  }

  const handleSearch = (event) => {
    event.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status, parentId: partnerId || undefined });
  };

  const handleStatusChange = (nextStatus) => {
    setStatus(nextStatus);
    setOffset(0);
    void load({ limit, offset: 0, q, status: nextStatus, parentId: partnerId || undefined });
  };

  const handleRefresh = () => {
    void load({ limit, offset, q, status, parentId: partnerId || undefined });
  };

  const handleSelectPartner = (nextId) => {
    setPartnerId(nextId);
    setOffset(0);
    void load({ limit, offset: 0, q, status, parentId: nextId || undefined });
  };

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <PageHeader title="Franchise List" subtitle="Manage franchise organizations." />
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
            value={partnerId}
            onChange={(e) => handleSelectPartner(e.target.value)}
            style={{ width: 260 }}
          >
            <option value="">Select Business Partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.hierarchyNodeId || ""}>
                {(p.hierarchyNode?.code || p.username || "").trim()} {p.hierarchyNode?.name ? `- ${p.hierarchyNode.name}` : ""}
              </option>
            ))}
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>
        </form>

        <div style={{ flex: 1 }} />
        <button className="button secondary" type="button" onClick={handleRefresh} style={{ width: "auto" }}>
          Refresh
        </button>
      </div>

      <DataTable
        columns={[
          {
            key: "code",
            header: "Code",
            render: (r) => r?.hierarchyNode?.code || r?.username || ""
          },
          { key: "username", header: "Username (FR###)" },
          {
            key: "name",
            header: "Name",
            render: (r) => r?.hierarchyNode?.name || ""
          },
          {
            key: "partner",
            header: "Partner",
            render: (r) => {
              const parent = r?.hierarchyNode?.parent;
              const code = parent?.code ? String(parent.code) : "";
              const name = parent?.name ? String(parent.name) : "";
              if (code && name) {
                return `${code} / ${name}`;
              }
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
              const bpNode = r?.hierarchyNode?.parent;
              const bpId = bpNode?.businessPartner?.id;
              const username = r?.username || "";
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  <Link
                    to={`/superadmin/users?q=${encodeURIComponent(username)}`}
                    className="button secondary"
                    style={{ width: "auto", fontSize: 12, padding: "2px 8px", textDecoration: "none" }}
                  >
                    View
                  </Link>
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
          void load({ ...next, q, status });
        }}
      />
    </section>
  );
}

export { SuperadminFranchisesPage };