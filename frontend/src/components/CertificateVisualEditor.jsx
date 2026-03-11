import { useCallback, useEffect, useRef, useState } from "react";

// A4 landscape ratio: 297mm x 210mm. We render at a fixed pixel canvas.
const A4_W = 297;
const A4_H = 210;
const CANVAS_W = 780;
const CANVAS_H = Math.round(CANVAS_W * (A4_H / A4_W)); // ~551

const SCALE = CANVAS_W / A4_W; // px per mm

function mmToPx(mm) { return mm * SCALE; }
function pxToMm(px) { return px / SCALE; }

const DEFAULT_ELEMENTS = {
  bpLogo:          { x: 22,       y: 18,  w: 28, h: 28, visible: true, label: "BP Logo" },
  affiliationLogo: { x: 297 - 50, y: 18,  w: 28, h: 28, visible: true, label: "Affiliation Logo" },
  title:           { x: 297 / 2,  y: 55,  w: 0,  h: 0,  visible: true, label: "Title", fontSize: 28 },
  subtitle:        { x: 297 / 2,  y: 72,  w: 0,  h: 0,  visible: true, label: "\"This is to certify that\"", fontSize: 14 },
  studentName:     { x: 297 / 2,  y: 88,  w: 0,  h: 0,  visible: true, label: "Student Name", fontSize: 24 },
  completionText:  { x: 297 / 2,  y: 106, w: 0,  h: 0,  visible: true, label: "\"has successfully completed\"", fontSize: 14 },
  levelName:       { x: 297 / 2,  y: 120, w: 0,  h: 0,  visible: true, label: "Level Name", fontSize: 20 },
  certMeta:        { x: 297 / 2,  y: 145, w: 0,  h: 0,  visible: true, label: "Certificate # & Date", fontSize: 10 },
  signature:       { x: 55,       y: 155, w: 40, h: 15, visible: true, label: "Signature" },
  signatoryInfo:   { x: 75,       y: 175, w: 0,  h: 0,  visible: true, label: "Signatory Name/Title", fontSize: 9 },
  stamp:           { x: 297 - 90, y: 152, w: 30, h: 30, visible: true, label: "Stamp / Seal" },
  qrCode:          { x: 297 - 45, y: 210 - 45, w: 25, h: 25, visible: true, label: "QR Code" },
  background:      { x: 0, y: 0, w: 297, h: 210, visible: true, label: "Background / Watermark" }
};

const ELEMENT_COLORS = {
  bpLogo: "#2563eb",
  affiliationLogo: "#7c3aed",
  title: "#92400e",
  subtitle: "#78716c",
  studentName: "#1e293b",
  completionText: "#78716c",
  levelName: "#2563eb",
  certMeta: "#6b7280",
  signature: "#059669",
  signatoryInfo: "#6b7280",
  stamp: "#dc2626",
  qrCode: "#6366f1",
  background: "#d97706"
};

const IMAGE_ELEMENTS = new Set(["bpLogo", "affiliationLogo", "signature", "stamp", "qrCode", "background"]);
const TEXT_ELEMENTS = new Set(["title", "subtitle", "studentName", "completionText", "levelName", "certMeta", "signatoryInfo"]);

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function withAlpha(color, alpha) {
  if (typeof color !== "string" || !color.startsWith("#")) {
    return color;
  }

  const normalized = color.length === 4
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;

  return `${normalized}${alpha}`;
}

function CertificateVisualEditor({ layout, onChange, template }) {
  const canvasRef = useRef(null);
  const [elements, setElements] = useState(() => {
    const base = {};
    for (const [k, v] of Object.entries(DEFAULT_ELEMENTS)) {
      base[k] = { ...v, ...(layout?.[k] || {}) };
    }
    return base;
  });
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);

  // Sync outward on element change
  useEffect(() => {
    onChange?.(elements);
  }, [elements, onChange]);

  // Build image map from template URLs for preview
  const imageUrls = {
    bpLogo: template?.bpLogoUrl || null,
    affiliationLogo: template?.affiliationLogoUrl || null,
    signature: template?.signatureImageUrl || null,
    stamp: template?.stampImageUrl || null,
    background: template?.backgroundImageUrl || null,
    qrCode: null // will show placeholder
  };

  const getCanvasXY = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { cx: 0, cy: 0 };
    return { cx: e.clientX - rect.left, cy: e.clientY - rect.top };
  }, []);

  const handleMouseDown = useCallback((e, key) => {
    e.stopPropagation();
    e.preventDefault();
    if (key === "background") return; // background not draggable directly
    setSelected(key);
    const { cx, cy } = getCanvasXY(e);
    const el = elements[key];
    setDragging({ key, startCx: cx, startCy: cy, startX: el.x, startY: el.y });
  }, [elements, getCanvasXY]);

  const handleResizeDown = useCallback((e, key) => {
    e.stopPropagation();
    e.preventDefault();
    const { cx, cy } = getCanvasXY(e);
    const el = elements[key];
    setResizing({ key, startCx: cx, startCy: cy, startW: el.w, startH: el.h });
  }, [elements, getCanvasXY]);

  useEffect(() => {
    if (!dragging && !resizing) return;

    const handleMove = (e) => {
      const { cx, cy } = getCanvasXY(e);
      if (dragging) {
        const dx = pxToMm(cx - dragging.startCx);
        const dy = pxToMm(cy - dragging.startCy);
        setElements((prev) => ({
          ...prev,
          [dragging.key]: {
            ...prev[dragging.key],
            x: clamp(dragging.startX + dx, 0, A4_W),
            y: clamp(dragging.startY + dy, 0, A4_H)
          }
        }));
      }
      if (resizing) {
        const dx = pxToMm(cx - resizing.startCx);
        const dy = pxToMm(cy - resizing.startCy);
        setElements((prev) => ({
          ...prev,
          [resizing.key]: {
            ...prev[resizing.key],
            w: clamp(resizing.startW + dx, 5, A4_W),
            h: clamp(resizing.startH + dy, 5, A4_H)
          }
        }));
      }
    };

    const handleUp = () => {
      setDragging(null);
      setResizing(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [dragging, resizing, getCanvasXY]);

  const updateElement = (key, patch) => {
    setElements((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const resetElement = (key) => {
    setElements((prev) => ({ ...prev, [key]: { ...DEFAULT_ELEMENTS[key] } }));
  };

  const resetAll = () => {
    const base = {};
    for (const [k, v] of Object.entries(DEFAULT_ELEMENTS)) {
      base[k] = { ...v };
    }
    setElements(base);
  };

  const renderElement = (key) => {
    const el = elements[key];
    if (!el.visible) return null;
    const isImg = IMAGE_ELEMENTS.has(key);
    const isTxt = TEXT_ELEMENTS.has(key);
    const color = ELEMENT_COLORS[key] || "#6b7280";
    const isSel = selected === key;

    if (key === "background") {
      // Background shown as faint overlay across the canvas
      return (
        <div
          key={key}
          onClick={(e) => { e.stopPropagation(); setSelected(key); }}
          style={{
            position: "absolute",
            inset: 0,
            border: isSel ? "2px dashed #d97706" : "none",
            cursor: "pointer",
            zIndex: 0,
            overflow: "hidden",
            pointerEvents: isSel ? "auto" : "none"
          }}
        >
          {imageUrls.background ? (
            <img src={imageUrls.background} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.12 }} />
          ) : null}
        </div>
      );
    }

    // For text elements — displayed as a label positioned by center-x, y
    if (isTxt) {
      const px = mmToPx(el.x);
      const py = mmToPx(el.y);
      const fs = Math.max(8, (el.fontSize || 14) * SCALE * 0.42);
      return (
        <div
          key={key}
          onMouseDown={(e) => handleMouseDown(e, key)}
          onClick={(e) => { e.stopPropagation(); setSelected(key); }}
          style={{
            position: "absolute",
            left: px,
            top: py - fs / 2,
            transform: "translateX(-50%)",
            fontSize: fs,
            fontWeight: key === "studentName" || key === "title" || key === "levelName" ? 700 : 400,
            color,
            cursor: "move",
            whiteSpace: "nowrap",
            userSelect: "none",
            border: isSel ? `2px dashed ${color}` : "1px dashed transparent",
            borderRadius: 3,
            padding: "1px 4px",
            background: isSel ? withAlpha(color, "1A") : "transparent",
            zIndex: isSel ? 20 : 5
          }}
        >
          {el.label}
        </div>
      );
    }

    // Image elements — draggable and resizable boxes
    const left = mmToPx(el.x);
    const top = mmToPx(el.y);
    const width = mmToPx(el.w);
    const height = mmToPx(el.h);
    const imgUrl = imageUrls[key];

    return (
      <div
        key={key}
        onMouseDown={(e) => handleMouseDown(e, key)}
        onClick={(e) => { e.stopPropagation(); setSelected(key); }}
        style={{
          position: "absolute",
          left,
          top,
          width,
          height,
          border: `2px ${isSel ? "solid" : "dashed"} ${color}`,
          borderRadius: 4,
          cursor: "move",
          userSelect: "none",
          background: imgUrl ? "transparent" : `${color}11`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          zIndex: isSel ? 20 : 3
        }}
      >
        {imgUrl ? (
          <img src={imgUrl} alt={el.label} style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }} />
        ) : (
          <span style={{ fontSize: 9, color, fontWeight: 600, textAlign: "center", lineHeight: 1.1, pointerEvents: "none" }}>{el.label}</span>
        )}
        {/* Resize handle */}
        {isSel ? (
          <div
            onMouseDown={(e) => handleResizeDown(e, key)}
            style={{
              position: "absolute",
              right: -4,
              bottom: -4,
              width: 10,
              height: 10,
              background: color,
              borderRadius: 2,
              cursor: "nwse-resize"
            }}
          />
        ) : null}
      </div>
    );
  };

  const sel = selected ? elements[selected] : null;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Visual Layout Editor</h3>
        <button
          type="button"
          onClick={resetAll}
          style={{ padding: "5px 14px", fontSize: 12, background: "var(--color-bg-muted)", border: "1px solid var(--color-border-strong)", borderRadius: 6, cursor: "pointer", color: "var(--color-text-primary)" }}
        >
          Reset All Positions
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 16, alignItems: "start" }}>
        {/* Canvas */}
        <div
          ref={canvasRef}
          onClick={() => setSelected(null)}
          style={{
            position: "relative",
            width: CANVAS_W,
            height: CANVAS_H,
            background: "#fffbeb",
            border: "3px double #d97706",
            borderRadius: 4,
            overflow: "hidden",
            cursor: "default",
            flexShrink: 0
          }}
        >
          {/* Inner border */}
          <div style={{
            position: "absolute",
            left: mmToPx(10), top: mmToPx(10),
            width: CANVAS_W - mmToPx(20), height: CANVAS_H - mmToPx(20),
            border: "2px solid #d97706",
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 1
          }} />
          <div style={{
            position: "absolute",
            left: mmToPx(14), top: mmToPx(14),
            width: CANVAS_W - mmToPx(28), height: CANVAS_H - mmToPx(28),
            border: "1px solid #d9770655",
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 1
          }} />
          {/* Decorative line under student name */}
          <div style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            top: mmToPx(elements.studentName.y + 5),
            width: mmToPx(100),
            height: 0,
            borderBottom: "2px solid #d97706",
            pointerEvents: "none",
            zIndex: 1
          }} />
          {/* Render all elements */}
          {Object.keys(elements).map(renderElement)}
        </div>

        {/* Properties panel */}
        <div style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: 10, padding: 14, fontSize: 12 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>
            {sel ? `Selected: ${sel.label}` : "Click an element"}
          </div>

          {sel && selected ? (
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "grid", gap: 2 }}>
                <span style={{ color: "var(--color-text-muted)" }}>X (mm)</span>
                <input type="number" step="1" value={Math.round(sel.x)} onChange={(e) => updateElement(selected, { x: Number(e.target.value) })}
                  style={{ padding: "4px 8px", border: "1px solid var(--color-border-strong)", borderRadius: 4, fontSize: 12, width: "100%", background: "var(--color-bg-card)", color: "var(--color-text-primary)" }} />
              </label>
              <label style={{ display: "grid", gap: 2 }}>
                <span style={{ color: "var(--color-text-muted)" }}>Y (mm)</span>
                <input type="number" step="1" value={Math.round(sel.y)} onChange={(e) => updateElement(selected, { y: Number(e.target.value) })}
                  style={{ padding: "4px 8px", border: "1px solid var(--color-border-strong)", borderRadius: 4, fontSize: 12, width: "100%", background: "var(--color-bg-card)", color: "var(--color-text-primary)" }} />
              </label>
              {IMAGE_ELEMENTS.has(selected) && selected !== "background" ? (
                <>
                  <label style={{ display: "grid", gap: 2 }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Width (mm)</span>
                    <input type="number" step="1" value={Math.round(sel.w)} onChange={(e) => updateElement(selected, { w: Number(e.target.value) })}
                      style={{ padding: "4px 8px", border: "1px solid var(--color-border-strong)", borderRadius: 4, fontSize: 12, width: "100%", background: "var(--color-bg-card)", color: "var(--color-text-primary)" }} />
                  </label>
                  <label style={{ display: "grid", gap: 2 }}>
                    <span style={{ color: "var(--color-text-muted)" }}>Height (mm)</span>
                    <input type="number" step="1" value={Math.round(sel.h)} onChange={(e) => updateElement(selected, { h: Number(e.target.value) })}
                      style={{ padding: "4px 8px", border: "1px solid var(--color-border-strong)", borderRadius: 4, fontSize: 12, width: "100%", background: "var(--color-bg-card)", color: "var(--color-text-primary)" }} />
                  </label>
                </>
              ) : null}
              {TEXT_ELEMENTS.has(selected) ? (
                <label style={{ display: "grid", gap: 2 }}>
                  <span style={{ color: "var(--color-text-muted)" }}>Font Size (pt)</span>
                  <input type="number" step="1" min="6" max="60" value={sel.fontSize || 14}
                    onChange={(e) => updateElement(selected, { fontSize: Number(e.target.value) })}
                    style={{ padding: "4px 8px", border: "1px solid var(--color-border-strong)", borderRadius: 4, fontSize: 12, width: "100%", background: "var(--color-bg-card)", color: "var(--color-text-primary)" }} />
                </label>
              ) : null}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <input type="checkbox" checked={sel.visible} onChange={(e) => updateElement(selected, { visible: e.target.checked })} />
                <span>Visible</span>
              </label>
              <button type="button" onClick={() => resetElement(selected)}
                style={{ padding: "4px 10px", fontSize: 11, background: "var(--color-bg-danger-light)", border: "1px solid var(--color-border-danger)", borderRadius: 4, color: "var(--color-text-danger)", cursor: "pointer", marginTop: 4 }}>
                Reset to Default
              </button>
            </div>
          ) : (
            <div style={{ color: "var(--color-text-faint)", fontSize: 11 }}>
              Drag elements on the canvas to reposition them. Click to select and edit properties.
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 12, paddingTop: 10 }}>
            <div style={{ fontWeight: 600, fontSize: 11, color: "var(--color-text-muted)", marginBottom: 6 }}>Elements</div>
            {Object.entries(elements).map(([key, el]) => (
              <div
                key={key}
                onClick={() => setSelected(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 6px",
                  borderRadius: 4,
                  cursor: "pointer",
                  background: selected === key ? "var(--color-primary-bg)" : "transparent",
                  fontSize: 11,
                  marginBottom: 2
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 2, background: ELEMENT_COLORS[key] || "#6b7280", flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: el.visible ? 1 : 0.4 }}>{el.label}</span>
                <span style={{ color: "var(--color-text-faint)", fontSize: 9 }}>{Math.round(el.x)},{Math.round(el.y)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
        Drag elements to reposition. Use the properties panel to fine-tune coordinates, size, font size, and visibility. 
        All measurements are in mm on an A4 landscape (297 × 210 mm) canvas.
      </div>
    </div>
  );
}

export { CertificateVisualEditor, DEFAULT_ELEMENTS };
