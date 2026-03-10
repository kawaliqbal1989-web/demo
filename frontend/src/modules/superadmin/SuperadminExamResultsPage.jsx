import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { DataTable } from "../../components/DataTable";
import { LoadingState } from "../../components/LoadingState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";
import { downloadBlob } from "../../utils/downloadBlob";
import { exportExamResultsCsv, getExamResults, publishExamResults, unpublishExamResults } from "../../services/examCyclesService";

function SuperadminExamResultsPage() {
  const { examCycleId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [resultStatus, setResultStatus] = useState("");
  const [acting, setActing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // "publish" | "unpublish" | null

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getExamResults(examCycleId);
      setRows(data?.data?.results || []);
      setResultStatus(String(data?.data?.status || ""));
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || "Failed to load results.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examCycleId]);

  const canPublish = useMemo(() => resultStatus !== "PUBLISHED", [resultStatus]);
  const canUnpublish = useMemo(() => resultStatus === "PUBLISHED", [resultStatus]);

  const doPublish = async () => {
    if (acting || !canPublish) return;
    setConfirmAction("publish");
  };

  const doUnpublish = async () => {
    if (acting || !canUnpublish) return;
    setConfirmAction("unpublish");
  };

  const executeAction = async () => {
    const action = confirmAction;
    setConfirmAction(null);
    setActing(true);
    setError("");
    try {
      if (action === "publish") await publishExamResults(examCycleId);
      else await unpublishExamResults(examCycleId);
      await load();
    } catch (err) {
      setError(getFriendlyErrorMessage(err) || `Failed to ${action} results.`);
    } finally {
      setActing(false);
    }
  };

  const doExport = async () => {
    try {
      const resp = await exportExamResultsCsv(examCycleId);
      downloadBlob(resp.data, `exam_results_${examCycleId}.csv`);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err) || "Failed to export CSV.");
    }
  };

  if (loading) {
    return <LoadingState label="Loading exam results..." />;
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0 }}>Exam Results</h2>
          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            Status: <b>{resultStatus}</b>
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => navigate(-1)} style={{ width: "auto" }}>
          Back
        </button>
      </div>

      <div className="card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button className="button secondary" type="button" onClick={() => void load()} style={{ width: "auto" }}>
          Refresh
        </button>
        <button className="button secondary" type="button" onClick={() => void doExport()} style={{ width: "auto" }}>
          Export CSV
        </button>
        <div style={{ flex: 1 }} />
        <button className="button" type="button" onClick={() => void doPublish()} disabled={acting || !canPublish} style={{ width: "auto" }}>
          Publish
        </button>
        <button
          className="button secondary"
          type="button"
          onClick={() => void doUnpublish()}
          disabled={acting || !canUnpublish}
          style={{ width: "auto" }}
        >
          Unpublish
        </button>
      </div>

      {error ? (
        <div className="card">
          <p className="error">{error}</p>
        </div>
      ) : null}

      <div className="card" style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 600 }}>Results</div>
        <DataTable
          columns={[
            { key: "admissionNo", header: "Student Code", render: (r) => r?.admissionNo || "" },
            { key: "name", header: "Student Name", render: (r) => r?.studentName || "" },
            { key: "score", header: "Score", render: (r) => (r?.score === null || r?.score === undefined ? "" : String(r.score)) },
            { key: "correct", header: "Correct", render: (r) => (r?.correctCount === null || r?.correctCount === undefined ? "" : String(r.correctCount)) },
            { key: "total", header: "Total", render: (r) => (r?.totalQuestions === null || r?.totalQuestions === undefined ? "" : String(r.totalQuestions)) },
            { key: "time", header: "Time (sec)", render: (r) => (r?.completionTimeSeconds === null || r?.completionTimeSeconds === undefined ? "" : String(r.completionTimeSeconds)) }
          ]}
          rows={rows}
          keyField={(row) => row?.studentId || row?.admissionNo || JSON.stringify(row)}
        />
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction === "publish" ? "Publish Results" : "Unpublish Results"}
        message={confirmAction === "publish"
          ? "Publish results? After publishing, authorized roles can view results."
          : "Unpublish results? Non-superadmin roles will lose access."}
        confirmLabel={confirmAction === "publish" ? "Publish" : "Unpublish"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void executeAction()}
      />
    </section>
  );
}

export { SuperadminExamResultsPage };
