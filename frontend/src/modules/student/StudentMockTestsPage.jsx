import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { getStudentMockTest, listStudentMockTests } from "../../services/studentPortalService";

function getStatusStyle(status) {
  if (status === "PUBLISHED") {
    return { background: "var(--color-bg-success-light)", color: "var(--color-text-success)" };
  }
  if (status === "ARCHIVED") {
    return { background: "var(--color-bg-muted)", color: "var(--color-text-label)" };
  }
  return { background: "var(--color-bg-warning)", color: "var(--color-text-warning)" };
}

function StudentMockTestsPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listStudentMockTests();
      const list = res?.data?.data || [];
      setItems(Array.isArray(list) ? list : []);
      if (!selectedId && Array.isArray(list) && list.length) {
        setSelectedId(list[0].id);
      }
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock tests.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (mockTestId) => {
    if (!mockTestId) {
      setSelected(null);
      return;
    }
    setLoadingDetail(true);
    setError("");
    try {
      const res = await getStudentMockTest(mockTestId);
      setSelected(res?.data?.data || null);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load mock test details.");
      setSelected(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    void loadDetail(selectedId);
  }, [selectedId]);

  if (loading) {
    return <LoadingState label="Loading mock tests..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0 }}>Mock Tests</h2>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Published and archived mock tests available for your active batches.</div>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <DataTable
        columns={[
          { key: "date", header: "Date", render: (r) => (r?.date ? String(r.date).slice(0, 10) : "—") },
          { key: "title", header: "Title", render: (r) => r?.title || "—" },
          { key: "batch", header: "Batch", render: (r) => r?.batch?.name || "—" },
          {
            key: "mode",
            header: "Mode",
            render: (r) => (r?.worksheetId ? "Online + Manual" : "Manual")
          },
          { key: "max", header: "Max", render: (r) => r?.maxMarks ?? "—" },
          { key: "marks", header: "Your Marks", render: (r) => (r?.marks == null ? "Not Recorded" : r.marks) },
          {
            key: "status",
            header: "Status",
            render: (r) => {
              const status = r?.status || "DRAFT";
              return (
                <span
                  style={{
                    ...getStatusStyle(status),
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700
                  }}
                >
                  {status}
                </span>
              );
            }
          },
          {
            key: "actions",
            header: "Actions",
            render: (r) => (
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="button secondary"
                  style={{ width: "auto" }}
                  onClick={() => setSelectedId(r.id)}
                >
                  View
                </button>
                {r?.worksheetId ? (
                  <button
                    className="button"
                    style={{ width: "auto" }}
                    onClick={() => navigate(`/student/mock-tests/${r.id}/attempt`)}
                  >
                    Start Online
                  </button>
                ) : null}
              </div>
            )
          }
        ]}
        rows={items}
        keyField="id"
      />

      {!items.length ? <div className="card" style={{ color: "var(--color-text-muted)" }}>No mock tests available right now.</div> : null}

      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h3 style={{ margin: 0 }}>My Result</h3>
        {!selectedId ? (
          <div style={{ color: "var(--color-text-muted)" }}>Select a mock test to view details.</div>
        ) : loadingDetail ? (
          <LoadingState label="Loading details..." />
        ) : !selected ? (
          <div style={{ color: "var(--color-text-muted)" }}>No details found.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div><strong>Title:</strong> {selected.title}</div>
            <div><strong>Batch:</strong> {selected.batch?.name || "—"}</div>
            <div><strong>Date:</strong> {selected.date ? String(selected.date).slice(0, 10) : "—"}</div>
            <div><strong>Status:</strong> {selected.status || "—"}</div>
            <div><strong>Mode:</strong> {selected.worksheetId ? "Online + Manual" : "Manual"}</div>
            <div><strong>Marks:</strong> {selected.marks == null ? "Not Recorded" : `${selected.marks} / ${selected.maxMarks}`}</div>
            <div><strong>Percentage:</strong> {selected.percentage == null ? "—" : `${selected.percentage}%`}</div>
            {selected.worksheetId ? (
              <div>
                <button
                  className="button"
                  style={{ width: "auto" }}
                  onClick={() => navigate(`/student/mock-tests/${selected.id}/attempt`)}
                >
                  Start Online Attempt
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

export { StudentMockTestsPage };
