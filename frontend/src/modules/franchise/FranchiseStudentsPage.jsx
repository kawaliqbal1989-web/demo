import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { exportFranchiseStudentsCsv, listFranchiseStudents } from "../../services/franchiseService";

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

function FranchiseStudentsPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");

  const load = async (next = { limit, offset, q }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listFranchiseStudents(next);
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
    void load({ limit, offset, q });
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setOffset(0);
    void load({ limit, offset: 0, q });
  };

  const handleExport = async () => {
    try {
      const resp = await exportFranchiseStudentsCsv({ q });
      downloadBlob(resp.data, `franchise_students_${Date.now()}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading students..." />;
  }

  const columns = [
    { key: "admissionNo", header: "Admission No" },
    {
      key: "name",
      header: "Name",
      render: (r) => `${r?.firstName || ""} ${r?.lastName || ""}`.trim()
    },
    { key: "email", header: "Email" },
    {
      key: "center",
      header: "Center",
      render: (r) => r?.hierarchyNode?.name || ""
    },
    {
      key: "activeEnrollments",
      header: "Active Enrollments",
      render: (r) => String(r?.activeEnrollments ?? 0)
    }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Students</h2>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Franchise student overview</div>
          </div>
          <button className="button secondary" style={{ width: "auto" }} onClick={handleExport}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="card">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            className="input"
            placeholder="Search (name/admission/email/center)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="button" style={{ width: "auto" }}>
            Search
          </button>
        </form>
        {error ? <div style={{ color: "var(--color-text-danger)", marginTop: 8 }}>{error}</div> : null}
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
          void load({ limit: next.limit, offset: next.offset, q });
        }}
      />
    </div>
  );
}

export { FranchiseStudentsPage };
