import { useState } from "react";
import toast from "react-hot-toast";
import { getFriendlyErrorMessage } from "../../../utils/apiErrors";
import { useSettlementWorkflowActions } from "../hooks/useSettlementWorkflowActions";
import {
  JsonPreview,
  WorkflowBadge,
  formatWorkflowDateTime
} from "./SettlementWorkflowPrimitives";

const EMPTY_FORM = {
  recordType: "CENTER_REVENUE_SHEET",
  fileUrl: "",
  fileName: "",
  mimeType: "",
  notes: ""
};

function SettlementSupportingRecordsSection({ settlementId, supportingRecords = [], canUpload = false, onUploadComplete }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const actions = useSettlementWorkflowActions(settlementId, {
    onSuccess: (_result, actionType) => {
      if (actionType === "UPLOAD_SUPPORTING_RECORD") {
        toast.success("Supporting record attached.");
        setForm(EMPTY_FORM);
        onUploadComplete?.();
      }
    }
  });

  async function handleUploadSubmit(event) {
    event.preventDefault();
    if (!canUpload) {
      return;
    }

    await actions.uploadSupportingRecord(form);
  }

  return (
    <section className="card" style={{ display: "grid", gap: 16 }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Supporting Records</div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
          Evidence attached to this settlement workflow.
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
        Supporting records are append-only evidence. Uploaded items remain visible in immutable workflow history.
      </div>

      {actions.error ? (
        <div role="alert" style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-danger-light)", color: "var(--color-text-danger)" }}>
          {getFriendlyErrorMessage(actions.error)}
        </div>
      ) : null}

      <form onSubmit={handleUploadSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Record Type</span>
            <input
              className="input"
              value={form.recordType}
              disabled={!canUpload || actions.isBusy}
              onChange={(event) => setForm((current) => ({ ...current, recordType: event.target.value }))}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>File Name</span>
            <input
              className="input"
              value={form.fileName}
              disabled={!canUpload || actions.isBusy}
              onChange={(event) => setForm((current) => ({ ...current, fileName: event.target.value }))}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Mime Type</span>
            <input
              className="input"
              value={form.mimeType}
              disabled={!canUpload || actions.isBusy}
              onChange={(event) => setForm((current) => ({ ...current, mimeType: event.target.value }))}
            />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>File URL</span>
          <input
            className="input"
            value={form.fileUrl}
            disabled={!canUpload || actions.isBusy}
            onChange={(event) => setForm((current) => ({ ...current, fileUrl: event.target.value }))}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Notes</span>
          <textarea
            className="input"
            rows={3}
            value={form.notes}
            disabled={!canUpload || actions.isBusy}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </label>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
            {canUpload ? "Uploads are enabled for this workflow scope." : "Supporting-record upload is read-only on BP routes."}
          </span>
          <button
            className="button"
            type="submit"
            style={{ width: "auto" }}
            disabled={!canUpload || actions.isBusy || !form.recordType.trim() || !form.fileName.trim() || !form.fileUrl.trim()}
          >
            {actions.busyAction === "UPLOAD_SUPPORTING_RECORD" ? `Uploading ${actions.uploadProgress || 0}%` : "Upload Record"}
          </button>
        </div>

        {actions.busyAction === "UPLOAD_SUPPORTING_RECORD" ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Upload progress</div>
            <div style={{ height: 10, borderRadius: 999, background: "rgba(148, 163, 184, 0.2)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${actions.uploadProgress || 0}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #16a34a, #22c55e)"
                }}
              />
            </div>
          </div>
        ) : null}
      </form>

      {supportingRecords.length === 0 ? (
        <div style={{ color: "var(--color-text-muted)" }}>No supporting records attached.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {supportingRecords.map((record) => (
            <article
              key={record.id}
              style={{
                display: "grid",
                gap: 10,
                padding: 16,
                borderRadius: 16,
                border: "1px solid var(--color-border)",
                background: "rgba(16, 185, 129, 0.06)"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <WorkflowBadge value={record.recordType} tone="success" />
                  <WorkflowBadge value={record.uploadedByRole} tone="info" />
                </div>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{formatWorkflowDateTime(record.createdAt)}</span>
              </div>

              <div style={{ display: "grid", gap: 4 }}>
                <a href={record.fileUrl} target="_blank" rel="noreferrer" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 700 }}>
                  {record.fileName || record.fileUrl}
                </a>
                <span>
                  <strong>Uploaded By:</strong> {record.uploadedByUser?.username || record.uploadedByUser?.email || record.uploadedByRole}
                </span>
                {record.notes ? (
                  <span>
                    <strong>Notes:</strong> {record.notes}
                  </span>
                ) : null}
              </div>

              <JsonPreview value={record.metadata} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export { SettlementSupportingRecordsSection };