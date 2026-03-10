import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { exportFranchiseReportsCsv, getFranchiseReports } from "../../services/franchiseService";

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

function FranchiseReportsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [centers, setCenters] = useState([]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getFranchiseReports();
      setSummary(data.data.summary || null);
      setCenters(data.data.centers || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleExport = async () => {
    try {
      const resp = await exportFranchiseReportsCsv();
      downloadBlob(resp.data, `franchise_reports_${Date.now()}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading && !centers.length) {
    return <LoadingState label="Loading reports..." />;
  }

  const columns = [
    { key: "centerCode", header: "Center Code" },
    { key: "centerName", header: "Center Name" },
    { key: "centerStatus", header: "Status" },
    { key: "studentsTotal", header: "Students" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0 }}>Reports</h2>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Center-level summary</div>
          </div>
          <button className="button secondary" style={{ width: "auto" }} onClick={handleExport}>
            Export CSV
          </button>
        </div>
        {summary ? (
          <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Centers: <strong>{summary.centers}</strong>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Students: <strong>{summary.studentsTotal}</strong>
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              Active Enrollments: <strong>{summary.activeEnrollments}</strong>
            </div>
          </div>
        ) : null}
        {error ? <div style={{ color: "var(--color-text-danger)", marginTop: 8 }}>{error}</div> : null}
      </div>

      <DataTable columns={columns} rows={centers} keyField="centerCode" />
    </div>
  );
}

export { FranchiseReportsPage };
