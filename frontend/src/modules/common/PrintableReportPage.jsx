import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { LoadingState } from "../../components/LoadingState";
import { ErrorState } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { MetricCard } from "../../components/MetricCard";
import { ReportActionButtons } from "../../components/ReportActionButtons";
import { getPrintableReport } from "../../services/reportingFoundationService";
import { getFriendlyErrorMessage } from "../../utils/apiErrors";

const printableReportStyles = `
  @page {
    margin: 12mm;
    size: auto;
  }

  @media print {
    body {
      background: #ffffff !important;
    }

    .printable-report-shell {
      max-width: none !important;
      padding: 0 !important;
      gap: 12px !important;
    }

    .printable-report-actions {
      display: none !important;
    }

    .printable-report-card,
    .printable-report-section,
    .printable-report-table {
      break-inside: avoid-page;
      page-break-inside: avoid;
      box-shadow: none !important;
    }

    .printable-report-table-scroll {
      overflow: visible !important;
    }

    .printable-report-table-element {
      min-width: 100% !important;
      table-layout: fixed;
    }
  }
`;

function unwrapEnvelope(response) {
  return response?.data || response || null;
}

function PrintableReportPage() {
  const { reportKey = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const params = useMemo(() => {
    const entries = {};
    for (const [key, value] of searchParams.entries()) {
      if (key === "autoprint") {
        continue;
      }
      entries[key] = value;
    }
    return entries;
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      setLoading(true);
      setError("");
      try {
        const response = await getPrintableReport(reportKey, params);
        if (cancelled) {
          return;
        }
        setReport(unwrapEnvelope(response));
      } catch (loadError) {
        if (!cancelled) {
          setError(getFriendlyErrorMessage(loadError) || "Failed to load printable report.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadReport();

    return () => {
      cancelled = true;
    };
  }, [params, reportKey]);

  useEffect(() => {
    if (!report?.documentTitle) {
      return undefined;
    }

    const previousTitle = document.title;
    document.title = report.documentTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [report?.documentTitle]);

  useEffect(() => {
    if (!report || searchParams.get("autoprint") !== "1") {
      return;
    }

    window.print();
  }, [report, searchParams]);

  if (loading) {
    return <LoadingState label="Loading printable report..." />;
  }

  if (error || !report) {
    return <ErrorState title="Printable report unavailable" message={error || "The report could not be loaded."} />;
  }

  return (
    <section className="printable-report-shell" style={{ display: "grid", gap: 16, padding: 24, maxWidth: 1280, margin: "0 auto" }}>
      <style>{printableReportStyles}</style>
      <PageHeader
        title={report.title || "Printable Report"}
        subtitle={report.subtitle || "Structured printable report view."}
        actions={
          <div className="printable-report-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link className="button secondary" style={{ width: "auto" }} to="/">
              Back to app
            </Link>
            <button className="button" style={{ width: "auto" }} type="button" onClick={() => window.print()}>
              Print now
            </button>
            <ReportActionButtons reportKey={reportKey} params={params} hidePrint />
          </div>
        }
      >
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", display: "grid", gap: 4 }}>
          Generated {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : "just now"}
          {report.scope?.label ? ` • ${report.scope.label}` : ""}
          {report.scope?.role ? ` • ${report.scope.role}` : ""}
          {report.metadata?.snapshot?.referenceId ? ` • Snapshot ${report.metadata.snapshot.referenceId}` : ""}
        </div>
      </PageHeader>

      <div className="printable-report-card card" style={{ display: "grid", gap: 8, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>
          Export Lineage
        </div>
        <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Snapshot Reference</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{report.metadata?.snapshot?.referenceId || "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Captured At</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{report.metadata?.snapshot?.capturedAt ? new Date(report.metadata.snapshot.capturedAt).toLocaleString() : "-"}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Integrity</div>
            <div style={{ fontSize: 14, fontWeight: 600, wordBreak: "break-all" }}>{report.metadata?.integrity?.digest || "-"}</div>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {(report.highlights || []).map((item) => (
          <MetricCard
            key={item.id || item.label}
            label={item.label}
            value={item.displayValue || String(item.value ?? "-")}
          />
        ))}
      </div>

      {(report.sections || []).map((section) => {
        const sectionTables = (report.tables || []).filter((table) => (section.tableIds || []).includes(table.id));
        return (
          <article key={section.id} className="printable-report-section card" style={{ display: "grid", gap: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>{section.title}</h3>
            </div>

            {section.summaryItems?.length ? (
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
                {section.summaryItems.map((item) => (
                  <div key={`${section.id}-${item.label}`} style={{ padding: 12, borderRadius: 12, background: "var(--color-bg-subtle)" }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{item.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{item.displayValue || String(item.value ?? "-")}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {sectionTables.map((table) => (
              <div key={table.id} className="printable-report-table" style={{ display: "grid", gap: 8 }}>
                <h4 style={{ margin: 0 }}>{table.title}</h4>
                {table.rows?.length ? (
                  <div className="printable-report-table-scroll" style={{ overflowX: "auto" }}>
                    <table className="printable-report-table-element" style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
                      <thead>
                        <tr>
                          {(table.columns || []).map((column) => (
                            <th
                              key={`${table.id}-${column.key}`}
                              style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid var(--color-border)" }}
                            >
                              {column.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row, rowIndex) => (
                          <tr key={`${table.id}-${rowIndex}`}>
                            {(table.columns || []).map((column) => (
                              <td
                                key={`${table.id}-${rowIndex}-${column.key}`}
                                style={{ padding: "10px 12px", borderBottom: "1px solid var(--color-border-divider)" }}
                              >
                                {String(row?.[column.key] ?? "-")}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ color: "var(--color-text-muted)", fontSize: 13 }}>No rows available for this section.</div>
                )}
              </div>
            ))}
          </article>
        );
      })}
    </section>
  );
}

export { PrintableReportPage };