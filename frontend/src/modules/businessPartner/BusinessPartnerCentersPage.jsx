import { useEffect, useState } from "react";
import { DataTable, PaginationBar } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { listCenters } from "../../services/centersService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

function BusinessPartnerCentersPage() {
  const [rows, setRows] = useState([]);
  const [limit, setLimit] = useState(20);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (next = { limit, offset }) => {
    setLoading(true);
    setError("");
    try {
      const data = await listCenters(next);
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
    void load({ limit, offset });
  }, []);

  if (loading && !rows.length) {
    return <LoadingState label="Loading centers..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Centers</h2>
      {error ? <div className="card"><p className="error">{error}</p></div> : null}

      <DataTable
        columns={[
          { key: "name", header: "Name" },
          { key: "type", header: "Type" },
          { key: "code", header: "Code" },
          { key: "studentsActive", header: "Active Students" },
          { key: "teachersActive", header: "Active Teachers" },
          { key: "newEnrollmentsLast30Days", header: "New Enrollments (30d)" }
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
          void load(next);
        }}
      />
    </section>
  );
}

export { BusinessPartnerCentersPage };
