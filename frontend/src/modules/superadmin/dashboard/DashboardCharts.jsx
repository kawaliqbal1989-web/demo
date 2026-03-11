import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../hooks/useAuth";
import { recordDashboardAction } from "../../../services/superadminService";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function downloadBlob({ blob, filename }) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function toCsvRow(values) {
  return values
    .map((v) => {
      const s = v === null || v === undefined ? "" : String(v);
      const escaped = s.replace(/"/g, '""');
      return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped;
    })
    .join(",");
}

function buildCsv({ data, history }) {
  const lines = [];
  lines.push(toCsvRow(["asOf", "tenantId", "metric", "value"]));

  const appendSnapshot = (snapshot) => {
    const asOf = snapshot?.asOf || "";
    const tenantId = data?.tenantId || "";
    const metrics = snapshot?.metrics || {};
    for (const [metric, value] of Object.entries(metrics)) {
      lines.push(toCsvRow([asOf, tenantId, metric, value]));
    }
  };

  // Current data first
  if (data?.metrics) {
    appendSnapshot({ asOf: data.asOf, metrics: data.metrics });
  }

  // History
  for (const point of history || []) {
    appendSnapshot(point);
  }

  return lines.join("\n");
}

async function exportPdf({ data, history }) {
  const { jsPDF } = await import("jspdf");

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 40;
  let y = 44;

  doc.setFontSize(16);
  doc.text("Superadmin Dashboard KPIs", left, y);
  y += 22;

  doc.setFontSize(10);
  doc.text(`As of: ${data?.asOf || ""}`, left, y);
  y += 14;
  doc.text(`Tenant: ${data?.tenantId || ""}`, left, y);
  y += 22;

  doc.setFontSize(12);
  doc.text("Current Metrics", left, y);
  y += 16;

  doc.setFontSize(10);
  const entries = Object.entries(data?.metrics || {});
  for (const [key, value] of entries) {
    if (y > 760) {
      doc.addPage();
      y = 44;
    }
    doc.text(`${key}: ${value}`, left, y);
    y += 14;
  }

  y += 12;
  doc.setFontSize(12);
  doc.text("Trend Snapshots (most recent)", left, y);
  y += 16;
  doc.setFontSize(10);

  const last = (history || []).slice(-10);
  for (const point of last) {
    if (y > 760) {
      doc.addPage();
      y = 44;
    }
    doc.text(`${point.asOf}`, left, y);
    y += 14;
  }

  return doc.output("blob");
}

function DashboardCharts({ data, history }) {
  const { capabilities } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);

  const canExport = Boolean(capabilities?.canViewReports);

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "data-theme")) {
        setThemeVersion((version) => version + 1);
      }
    });

    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const palette = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue("--color-primary").trim() || "#2563eb",
      textPrimary: styles.getPropertyValue("--color-text-primary").trim() || "#1f2937",
      textLabel: styles.getPropertyValue("--color-text-label").trim() || "#374151",
      textMuted: styles.getPropertyValue("--color-text-muted").trim() || "#6b7280",
      textDanger: styles.getPropertyValue("--color-text-danger").trim() || "#b91c1c",
      bgCard: styles.getPropertyValue("--color-bg-card").trim() || "#ffffff",
      border: styles.getPropertyValue("--color-border").trim() || "#e5e7eb"
    };
  }, [themeVersion]);

  const chartData = useMemo(() => {
    const points = (history || []).slice(-20);
    const labels = points.map((p) => {
      const d = new Date(p.asOf);
      return Number.isFinite(d.getTime()) ? d.toLocaleTimeString() : String(p.asOf);
    });

    const series = (key) => points.map((p) => Number(p.metrics?.[key] ?? 0));

    return {
      labels,
      datasets: [
        {
          label: "Active Business Partners",
          data: series("activeBusinessPartners"),
          borderColor: palette.primary,
          backgroundColor: palette.primary,
          tension: 0.25
        },
        {
          label: "Active Students",
          data: series("activeStudents"),
          borderColor: palette.textPrimary,
          backgroundColor: palette.textPrimary,
          tension: 0.25
        },
        {
          label: "Open Abuse Flags",
          data: series("openAbuseFlags"),
          borderColor: palette.textDanger,
          backgroundColor: palette.textDanger,
          tension: 0.25
        }
      ]
    };
  }, [history, palette]);

  const revenueChartData = useMemo(() => {
    const points = (history || []).slice(-20);
    const labels = points.map((p) => {
      const d = new Date(p.asOf);
      return Number.isFinite(d.getTime()) ? d.toLocaleTimeString() : String(p.asOf);
    });

    return {
      labels,
      datasets: [
        {
          label: "Gross Revenue (MTD)",
          data: points.map((p) => Number(p.metrics?.grossRevenueMtd ?? 0)),
          borderColor: palette.textLabel,
          backgroundColor: palette.textLabel,
          tension: 0.25
        }
      ]
    };
  }, [history, palette]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: palette.textPrimary
        }
      },
      tooltip: {
        backgroundColor: palette.bgCard,
        titleColor: palette.textPrimary,
        bodyColor: palette.textMuted,
        borderColor: palette.border,
        borderWidth: 1
      }
    },
    scales: {
      x: {
        ticks: { color: palette.textMuted },
        grid: { color: palette.border }
      },
      y: {
        beginAtZero: true,
        ticks: { color: palette.textMuted },
        grid: { color: palette.border }
      }
    }
  };

  const onExportCsv = async () => {
    if (!canExport) {
      return;
    }

    setExporting(true);
    try {
      const csv = buildCsv({ data, history });
      downloadBlob({
        blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
        filename: `superadmin-kpis-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`
      });

      void recordDashboardAction({ actionType: "EXPORT_CSV" }).catch(() => {});
    } finally {
      setExporting(false);
    }
  };

  const onExportPdf = async () => {
    if (!canExport) {
      return;
    }

    setExporting(true);
    try {
      const blob = await exportPdf({ data, history });
      downloadBlob({
        blob,
        filename: `superadmin-kpis-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.pdf`
      });

      void recordDashboardAction({ actionType: "EXPORT_PDF" }).catch(() => {});
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ fontWeight: 700 }}>System Health</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              API uptime: {data?.health?.uptimeSeconds ?? "-"}s · DB: {data?.health?.db || "-"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              className="button secondary"
              style={{ width: "auto" }}
              onClick={onExportCsv}
              disabled={!canExport || exporting}
              aria-disabled={!canExport || exporting}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="button secondary"
              style={{ width: "auto" }}
              onClick={onExportPdf}
              disabled={!canExport || exporting}
              aria-disabled={!canExport || exporting}
            >
              Export PDF
            </button>
          </div>
        </div>

        {!canExport ? <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Export not permitted</div> : null}
      </div>

      <div className="card" style={{ height: 320 }} aria-label="Trend analysis for key metrics">
        <Line data={chartData} options={chartOptions} />
      </div>

      <div className="card" style={{ height: 280 }} aria-label="Revenue trend">
        <Line data={revenueChartData} options={chartOptions} />
      </div>
    </div>
  );
}

export default DashboardCharts;
