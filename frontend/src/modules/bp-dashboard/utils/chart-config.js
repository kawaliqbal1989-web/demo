import { formatChartCurrency, formatCompactNumber, formatPercent, toNumber } from "./formatters";

function getChartPalette() {
  if (typeof window === "undefined") {
    return {
      primary: "#0f766e",
      secondary: "#1d4ed8",
      accent: "#ea580c",
      border: "#d1d5db",
      text: "#1f2937",
      muted: "#6b7280",
      surface: "#ffffff"
    };
  }

  const styles = getComputedStyle(document.documentElement);
  return {
    primary: styles.getPropertyValue("--color-primary").trim() || "#0f766e",
    secondary: styles.getPropertyValue("--role-bp").trim() || "#1d4ed8",
    accent: styles.getPropertyValue("--color-warning").trim() || "#ea580c",
    border: styles.getPropertyValue("--color-border").trim() || "#d1d5db",
    text: styles.getPropertyValue("--color-text-primary").trim() || "#1f2937",
    muted: styles.getPropertyValue("--color-text-muted").trim() || "#6b7280",
    surface: styles.getPropertyValue("--color-bg-card").trim() || "#ffffff"
  };
}

function buildLineChartOptions({ palette, formatTooltipValue, secondaryAxis = null }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: palette.text,
          usePointStyle: true,
          boxWidth: 10
        }
      },
      tooltip: {
        backgroundColor: palette.surface,
        titleColor: palette.text,
        bodyColor: palette.muted,
        borderColor: palette.border,
        borderWidth: 1,
        callbacks: {
          label(context) {
            const datasetLabel = context.dataset?.label || "Value";
            const formatter = context.dataset?.yAxisID === "y1" && secondaryAxis?.formatTooltipValue
              ? secondaryAxis.formatTooltipValue
              : formatTooltipValue;
            return `${datasetLabel}: ${formatter(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: palette.muted },
        grid: { color: palette.border }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: palette.muted,
          callback(value) {
            return formatTooltipValue(value);
          }
        },
        grid: { color: palette.border }
      },
      ...(secondaryAxis
        ? {
            y1: {
              beginAtZero: true,
              position: "right",
              ticks: {
                color: palette.muted,
                callback(value) {
                  return secondaryAxis.tickFormatter(value);
                }
              },
              grid: { drawOnChartArea: false }
            }
          }
        : {})
    }
  };
}

function currencyTick(value) {
  return formatChartCurrency(toNumber(value));
}

function numberTick(value) {
  return formatCompactNumber(toNumber(value));
}

function percentTick(value) {
  return formatPercent(toNumber(value), { digits: 1 });
}

export {
  buildLineChartOptions,
  currencyTick,
  getChartPalette,
  numberTick,
  percentTick
};