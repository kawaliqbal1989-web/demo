import { useEffect, useState } from "react";

function InputDialog({
  open,
  title = "Input",
  message = "",
  inputLabel = "",
  inputPlaceholder = "",
  inputType = "text",
  required = false,
  defaultValue = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel
}) {
  const [value, setValue] = useState(defaultValue);

  // Reset value when dialog opens/closes or defaultValue changes
  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

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
        {message ? <p style={{ marginTop: 0, color: "var(--color-text-muted)" }}>{message}</p> : null}
        <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
          {inputLabel ? (
            <label style={{ fontSize: 13, fontWeight: 600 }}>{inputLabel}</label>
          ) : null}
          <input
            className="input"
            type={inputType}
            placeholder={inputPlaceholder}
            value={value}
            autoFocus
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (!required || value.trim())) {
                onConfirm(value);
                setValue("");
              }
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button
            className="button secondary"
            style={{ width: "auto" }}
            onClick={() => { setValue(""); onCancel(); }}
          >
            {cancelLabel}
          </button>
          <button
            className="button"
            style={{ width: "auto" }}
            disabled={required && !value.trim()}
            onClick={() => { onConfirm(value); setValue(""); }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export { InputDialog };
