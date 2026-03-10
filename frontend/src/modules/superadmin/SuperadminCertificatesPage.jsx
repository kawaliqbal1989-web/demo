import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { InputDialog } from "../../components/InputDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  listSuperadminCertificates,
  revokeSuperadminCertificate,
  exportSuperadminCertificatesCsv
} from "../../services/superadminService";
import { listBusinessPartners } from "../../services/businessPartnersService";
import { listLevels } from "../../services/levelsService";

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

function SuperadminCertificatesPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [filterLevelId, setFilterLevelId] = useState("");
  const [filterBpId, setFilterBpId] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [levels, setLevels] = useState([]);
  const [bps, setBps] = useState([]);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const getFilters = () => ({
    limit, offset, q, status,
    levelId: filterLevelId,
    bpId: filterBpId,
    issuedFrom, issuedTo
  });

  const load = async (next) => {
    const params = next || getFilters();
    setLoading(true);
    setError("");
    try {
      const data = await listSuperadminCertificates(params);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load certificates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(getFilters());
    void (async () => {
      try {
        const lv = await listLevels({ limit: 50, offset: 0 });
        setLevels(lv.data || []);
      } catch {
        setLevels([]);
      }

      try {
        const bpRes = await listBusinessPartners({ limit: 200, offset: 0, status: "ACTIVE" });
        setBps(bpRes.data?.items || []);
      } catch {
        setBps([]);
      }
    })();
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading certificates..." />;
  }

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ ...getFilters(), offset: 0 });
  };

  const handleStatusChange = (next) => {
    setStatus(next);
    setOffset(0);
    void load({ ...getFilters(), status: next, offset: 0 });
  };

  const handleExportCsv = async () => {
    try {
      const blob = await exportSuperadminCertificatesCsv({
        q, status, levelId: filterLevelId, bpId: filterBpId, issuedFrom, issuedTo
      });
      downloadBlob(blob, `certificates_${Date.now()}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  const handleRevoke = (row) => {
    setRevokeTarget(row);
  };

  const executeRevoke = async (reason) => {
    const row = revokeTarget;
    setRevokeTarget(null);
    if (!reason) return;
    try {
      await revokeSuperadminCertificate(row.id, reason);
      toast.success("Certificate revoked.");
      await load(getFilters());
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to revoke certificate.");
    }
  };

  const hierarchyLabel = (student) => {
    const node = student?.hierarchyNode;
    if (!node) return "";
    const parts = [];
    if (node.parent?.parent?.name) parts.push(node.parent.parent.name);
    if (node.parent?.name) parts.push(node.parent.name);
    if (node.name) parts.push(node.name);
    return parts.join(" › ");
  };

  const columns = [
    { key: "certificateNumber", header: "Certificate #", render: (r) => r.certificateNumber },
    {
      key: "student",
      header: "Student",
      render: (r) =>
        `${r.student?.admissionNo || ""} - ${r.student?.firstName || ""} ${r.student?.lastName || ""}`.trim()
    },
    {
      key: "hierarchy",
      header: "BP / Franchise / Center",
      render: (r) => (
        <span style={{ fontSize: 12, color: "#6b7280" }}>{hierarchyLabel(r.student)}</span>
      )
    },
    { key: "level", header: "Level", render: (r) => `L${r.level?.rank ?? ""} ${r.level?.name || ""}`.trim() },
    { key: "issuedAt", header: "Issued", render: (r) => new Date(r.issuedAt).toLocaleString() },
    {
      key: "issuedBy",
      header: "Issued By",
      render: (r) => r.issuedBy?.email || r.issuedBy?.username || "-"
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.status} />
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8 }}>
          {r.status === "ISSUED" ? (
            <button
              className="button secondary"
              style={{ width: "auto" }}
              type="button"
              onClick={() => handleRevoke(r)}
            >
              Revoke
            </button>
          ) : (
            <span style={{ fontSize: 12, color: "#6b7280" }}>
              {r.revokedAt ? `Revoked ${new Date(r.revokedAt).toLocaleDateString()}` : ""}
            </span>
          )}
        </div>
      )
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>All Certificates</h2>
        <button className="button secondary" type="button" onClick={handleExportCsv} style={{ width: "auto" }}>
          Export CSV
        </button>
      </div>

      <div className="card" style={{ display: "grid", gap: 12 }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search certificate # / student"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select
            className="input"
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ width: 160 }}
          >
            <option value="">All Status</option>
            <option value="ISSUED">Issued</option>
            <option value="REVOKED">Revoked</option>
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>

          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => load(getFilters())}>
            Refresh
          </button>

          <button
            className="button secondary"
            type="button"
            style={{ width: "auto", fontSize: 12 }}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "▲ Less Filters" : "▼ More Filters"}
          </button>
        </form>

        {showAdvanced && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              paddingTop: 4,
              borderTop: "1px solid #e5e7eb"
            }}
          >
            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Business Partner</label>
              <select
                className="input"
                value={filterBpId}
                onChange={(e) => {
                  setFilterBpId(e.target.value);
                  setOffset(0);
                  void load({ ...getFilters(), bpId: e.target.value, offset: 0 });
                }}
                style={{ width: 220 }}
              >
                <option value="">All BPs</option>
                {bps.map((bp) => (
                  <option key={bp.id} value={bp.id}>
                    {bp.code} - {bp.displayName || bp.name || ""}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Level</label>
              <select
                className="input"
                value={filterLevelId}
                onChange={(e) => {
                  setFilterLevelId(e.target.value);
                  setOffset(0);
                  void load({ ...getFilters(), levelId: e.target.value, offset: 0 });
                }}
                style={{ width: 180 }}
              >
                <option value="">All Levels</option>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    L{l.rank} - {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Issued From</label>
              <input
                type="date"
                className="input"
                value={issuedFrom}
                onChange={(e) => {
                  setIssuedFrom(e.target.value);
                  setOffset(0);
                  void load({ ...getFilters(), issuedFrom: e.target.value, offset: 0 });
                }}
                style={{ width: 150 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: "#6b7280", display: "block" }}>Issued To</label>
              <input
                type="date"
                className="input"
                value={issuedTo}
                onChange={(e) => {
                  setIssuedTo(e.target.value);
                  setOffset(0);
                  void load({ ...getFilters(), issuedTo: e.target.value, offset: 0 });
                }}
                style={{ width: 150 }}
              />
            </div>

            <div style={{ alignSelf: "flex-end" }}>
              <button
                className="button secondary"
                type="button"
                style={{ width: "auto", fontSize: 12 }}
                onClick={() => {
                  setFilterLevelId("");
                  setFilterBpId("");
                  setIssuedFrom("");
                  setIssuedTo("");
                  setQ("");
                  setStatus("");
                  setOffset(0);
                  void load({ limit, offset: 0, q: "", status: "", levelId: "", bpId: "", issuedFrom: "", issuedTo: "" });
                }}
              >
                Clear Filters
              </button>
            </div>
          </div>
        )}
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="card">
        <DataTable columns={columns} rows={rows} keyField="id" />
        <PaginationBar
          limit={limit}
          offset={offset}
          onChange={(next) => {
            setLimit(next.limit);
            setOffset(next.offset);
            void load({ ...getFilters(), ...next });
          }}
          total={total}
        />
      </div>

      <InputDialog
        open={!!revokeTarget}
        title="Revoke Certificate"
        message={`Revoke certificate ${revokeTarget?.certificateNumber || ""}?`}
        inputLabel="Reason"
        inputPlaceholder="Revoke reason"
        required
        confirmLabel="Revoke"
        onCancel={() => setRevokeTarget(null)}
        onConfirm={(val) => void executeRevoke(val)}
      />
    </section>
  );
}

export { SuperadminCertificatesPage };
