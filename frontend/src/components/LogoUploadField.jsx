import { useEffect, useId, useState } from "react";
import { getFriendlyErrorMessage } from "../utils/apiErrors";
import { resolveAssetUrl } from "../utils/assetUrls";

const MAX_LOGO_FILE_SIZE = 2 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg"];

function getFileExtension(filename) {
  const text = String(filename || "").toLowerCase();
  const idx = text.lastIndexOf(".");
  return idx >= 0 ? text.slice(idx) : "";
}

function validateLogoFile(file) {
  if (!file) {
    return "Logo file is required.";
  }

  const extension = getFileExtension(file.name);
  if (!ALLOWED_MIME_TYPES.has(String(file.type || "").toLowerCase()) || !ALLOWED_EXTENSIONS.includes(extension)) {
    return "Only PNG, JPG, and JPEG files are allowed.";
  }

  if (file.size > MAX_LOGO_FILE_SIZE) {
    return "Logo file exceeds the 2 MB limit.";
  }

  return "";
}

function LogoUploadField({
  title = "Brand Logo",
  description = "Upload a PNG or JPG logo up to 2 MB.",
  uploadLabel = "Upload Logo",
  removeLabel = "Remove Logo",
  emptyLabel = "No logo uploaded yet.",
  currentLogoUrl = "",
  previewLogoUrl,
  canRemove,
  onUpload,
  onRemove,
  disabled = false
}) {
  const inputId = useId();
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [tempPreviewUrl, setTempPreviewUrl] = useState("");

  useEffect(() => {
    return () => {
      if (tempPreviewUrl) {
        URL.revokeObjectURL(tempPreviewUrl);
      }
    };
  }, [tempPreviewUrl]);

  useEffect(() => {
    if (!previewLogoUrl && !currentLogoUrl) {
      return;
    }

    if (tempPreviewUrl) {
      URL.revokeObjectURL(tempPreviewUrl);
      setTempPreviewUrl("");
    }
  }, [previewLogoUrl, currentLogoUrl]);

  async function handleFileSelection(file) {
    if (disabled || uploading || removing || typeof onUpload !== "function") {
      return;
    }

    const validationError = validateLogoFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (tempPreviewUrl) {
      URL.revokeObjectURL(tempPreviewUrl);
    }

    setTempPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setProgress(0);
    setError("");

    try {
      await onUpload(file, setProgress);
      setProgress(100);
    } catch (uploadError) {
      setError(getFriendlyErrorMessage(uploadError) || "Failed to upload logo.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    if (disabled || uploading || removing || typeof onRemove !== "function") {
      return;
    }

    setRemoving(true);
    setError("");
    setProgress(0);

    try {
      await onRemove();
      if (tempPreviewUrl) {
        URL.revokeObjectURL(tempPreviewUrl);
        setTempPreviewUrl("");
      }
    } catch (removeError) {
      setError(getFriendlyErrorMessage(removeError) || "Failed to remove logo.");
    } finally {
      setRemoving(false);
    }
  }

  const effectivePreviewUrl = resolveAssetUrl(previewLogoUrl || currentLogoUrl || tempPreviewUrl);
  const showRemoveAction = typeof canRemove === "boolean" ? canRemove : Boolean(currentLogoUrl);

  return (
    <div className="card" style={{ display: "grid", gap: 10 }}>
      <div>
        <h3 style={{ marginTop: 0, marginBottom: 4 }}>{title}</h3>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{description}</div>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading && !removing) {
            setDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          void handleFileSelection(event.dataTransfer?.files?.[0] || null);
        }}
        style={{
          display: "grid",
          gap: 10,
          padding: 14,
          borderRadius: 14,
          border: dragActive ? "1px solid var(--color-primary)" : "1px dashed rgba(148, 163, 184, 0.5)",
          background: dragActive ? "rgba(37, 99, 235, 0.08)" : "rgba(15, 23, 42, 0.02)"
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              overflow: "hidden",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              background: "#fff",
              display: "grid",
              placeItems: "center"
            }}
          >
            {effectivePreviewUrl ? (
              <img
                src={effectivePreviewUrl}
                alt={`${title} preview`}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            ) : (
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", padding: 8 }}>
                {emptyLabel}
              </span>
            )}
          </div>

          <div style={{ display: "grid", gap: 6, flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Drag and drop a file here or choose one manually.</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Accepted: PNG, JPG, JPEG. Max size: 2 MB.</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <label htmlFor={inputId} className="button secondary" style={{ width: "auto", cursor: disabled ? "not-allowed" : "pointer" }}>
                {uploading ? `Uploading ${progress}%` : uploadLabel}
              </label>
              <input
                id={inputId}
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                aria-label={`${title} file input`}
                disabled={disabled || uploading || removing}
                onChange={(event) => {
                  const [file] = Array.from(event.target.files || []);
                  void handleFileSelection(file || null);
                  event.target.value = "";
                }}
                style={{ display: "none" }}
              />
              {showRemoveAction ? (
                <button
                  type="button"
                  className="button"
                  style={{ width: "auto" }}
                  disabled={disabled || uploading || removing}
                  onClick={() => {
                    void handleRemove();
                  }}
                >
                  {removing ? "Removing..." : removeLabel}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {uploading ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ height: 8, borderRadius: 999, background: "rgba(148, 163, 184, 0.2)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${progress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #2563eb, #0f766e)",
                  transition: "width 120ms ease"
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{progress}% uploaded</div>
          </div>
        ) : null}

        {error ? <div className="error">{error}</div> : null}
      </div>
    </div>
  );
}

export { LogoUploadField };