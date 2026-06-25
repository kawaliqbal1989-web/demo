function ReportExportButton({
  onPrint,
  onExportPdf,
  onExportExcel,
  hidePrint = false,
  disabled = false,
  busy = false
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {!hidePrint ? (
        <button className="button secondary" style={{ width: "auto" }} type="button" onClick={onPrint} disabled={disabled}>
          Print Dashboard
        </button>
      ) : null}
      <button className="button secondary" style={{ width: "auto" }} type="button" onClick={onExportPdf} disabled={disabled || busy}>
        {busy ? "Queueing..." : "Export PDF"}
      </button>
      <button className="button secondary" style={{ width: "auto" }} type="button" onClick={onExportExcel} disabled={disabled || busy}>
        {busy ? "Queueing..." : "Export Excel"}
      </button>
    </div>
  );
}

export { ReportExportButton };
