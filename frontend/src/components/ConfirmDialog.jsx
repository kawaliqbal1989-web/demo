function ConfirmDialog({
  open,
  title = "Confirm",
  message = "Are you sure?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50
      }}
    >
      <div className="card" style={{ width: "100%", maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <p style={{ marginTop: 0 }}>{message}</p>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button className="button secondary" style={{ width: "auto" }} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="button" style={{ width: "auto" }} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { ConfirmDialog };
