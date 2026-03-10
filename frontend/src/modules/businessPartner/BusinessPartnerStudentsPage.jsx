import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { StatusBadge } from "../../components/StatusBadge";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { exportPartnerStudentsCsv, listPartnerStudents } from "../../services/partnerService";

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

function BusinessPartnerStudentsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = async (next = { limit, offset, q, status }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listPartnerStudents(next);
      setRows(data.data.items || []);
      setLimit(data.data.limit);
      setOffset(data.data.offset);
      setTotal(data.data.total || 0);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load students.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load({ limit, offset, q, status });
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading students..." />;
  }

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q, status });
  };

  const handleStatusChange = (next) => {
    setStatus(next);
    setOffset(0);
    void load({ limit, offset: 0, q, status: next });
  };

  const handleExportCsv = async () => {
    try {
      const resp = await exportPartnerStudentsCsv({ q, status });
      downloadBlob(resp.data, `partner_students_${Date.now()}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  const columns = [
    { key: "admissionNo", header: "Admission No", render: (r) => r.admissionNo },
    { key: "name", header: "Name", render: (r) => `${r.firstName} ${r.lastName}` },
    { key: "email", header: "Email", render: (r) => r.email || "" },
    { key: "center", header: "Center", render: (r) => r.hierarchyNode?.name || "" },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>Students</h2>
        <button className="button secondary" type="button" onClick={handleExportCsv} style={{ width: "auto" }}>
          Export CSV
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search admission/name/email"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 280 }}
          />

          <select className="input" value={status} onChange={(e) => handleStatusChange(e.target.value)} style={{ width: 180 }}>
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

          <button className="button secondary" type="submit" style={{ width: "auto" }}>
            Search
          </button>

          <button className="button secondary" type="button" style={{ width: "auto" }} onClick={() => load({ limit, offset, q, status })}>
            Refresh
          </button>
        </form>
      </div>

      {error ? (
        <div className="card">
          <p className="error" style={{ margin: 0 }}>
            {error}
          </p>
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
            void load({ ...next, q, status });
          }}
          total={total}
        />
      </div>
    </section>
  );
}

export { BusinessPartnerStudentsPage };
