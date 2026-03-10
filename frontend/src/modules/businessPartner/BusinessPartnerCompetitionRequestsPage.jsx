import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import {
  forwardPartnerCompetitionRequest,
  listPartnerCompetitionRequests,
  submitPartnerCompetitionRequest
} from "../../services/partnerService";
import { listLevels } from "../../services/levelsService";

function BusinessPartnerCompetitionRequestsPage() {
  const [rows, setRows] = useState([]);
  const [levels, setLevels] = useState([]);
  const [levelId, setLevelId] = useState("");
  const [title, setTitle] = useState("Abacus Competition");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listPartnerCompetitionRequests({ limit: 50, offset: 0 });
      setRows(data.data || []);
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load competition requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void (async () => {
      try {
        const lv = await listLevels({ limit: 50, offset: 0 });
        setLevels(lv.data || []);
      } catch {
        setLevels([]);
      }
    })();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !levelId || !startsAt || !endsAt) {
      toast.error("title, level, startsAt, endsAt required");
      return;
    }
    try {
      await submitPartnerCompetitionRequest({
        title,
        description: "Partner submitted competition request",
        startsAt,
        endsAt,
        levelId
      });
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to submit request.");
    }
  };

  const handleForward = async (row) => {
    try {
      await forwardPartnerCompetitionRequest(row.id);
      await load();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to forward.");
    }
  };

  if (loading && !rows.length) {
    return <LoadingState label="Loading competition requests..." />;
  }

  const columns = [
    { key: "title", header: "Title", render: (r) => r.title },
    { key: "level", header: "Level", render: (r) => r.level?.name || "" },
    { key: "stage", header: "Workflow Stage", render: (r) => r.workflowStage },
    { key: "status", header: "Status", render: (r) => r.status },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {r.workflowStage === "BP_REVIEW" ? (
            <button className="button secondary" style={{ width: "auto" }} type="button" onClick={() => handleForward(r)}>
              Forward to Superadmin
            </button>
          ) : null}
        </div>
      )
    }
  ];

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Competition Requests</h2>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Submit Request</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 260 }} />
          <select className="input" value={levelId} onChange={(e) => setLevelId(e.target.value)} style={{ width: 220 }}>
            <option value="">Select level</option>
            {levels.map((l) => (
              <option key={l.id} value={l.id}>
                L{l.rank} - {l.name}
              </option>
            ))}
          </select>
          <input className="input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          <input className="input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          <button className="button" style={{ width: "auto" }} type="submit">
            Submit
          </button>
          <button className="button secondary" style={{ width: "auto" }} type="button" onClick={load}>
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
      </div>
    </section>
  );
}

export { BusinessPartnerCompetitionRequestsPage };
