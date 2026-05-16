import { EmptyState } from "../../components/EmptyState";

const BAND_TONES = {
  THRIVING: { label: "Thriving", color: "#047857", surface: "rgba(16, 185, 129, 0.14)" },
  STEADY: { label: "Steady", color: "#0369a1", surface: "rgba(14, 165, 233, 0.14)" },
  WATCH: { label: "Watch", color: "#b45309", surface: "rgba(245, 158, 11, 0.16)" },
  AT_RISK: { label: "At Risk", color: "#b91c1c", surface: "rgba(248, 113, 113, 0.16)" }
};

function getBandTone(band) {
  return BAND_TONES[String(band || "").trim()] || { label: String(band || "Unknown").replace(/_/g, " "), color: "#475569", surface: "rgba(148, 163, 184, 0.16)" };
}

function formatBandLabel(band) {
  return getBandTone(band).label;
}

function formatPercent(value, digits = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  return `${numeric.toFixed(digits)}%`;
}

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  return numeric.toFixed(numeric % 1 === 0 ? 0 : 1);
}

function formatDate(value, options = {}) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    ...options
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function formatRelativeDayLabel(value) {
  if (!value) {
    return "Activity date unavailable";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Activity date unavailable";
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfValue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfValue.getTime()) / 86400000);

  if (diffDays <= 0) {
    return "Active today";
  }
  if (diffDays === 1) {
    return "Last active yesterday";
  }
  return `Last active ${diffDays} days ago`;
}

function SectionCard({ title, subtitle, aside, children, className = "" }) {
  return (
    <section className={`card engagement-dashboard__section ${className}`.trim()}>
      <div className="engagement-dashboard__section-head">
        <div>
          <h3 className="engagement-dashboard__section-title">{title}</h3>
          {subtitle ? <p className="engagement-dashboard__section-subtitle">{subtitle}</p> : null}
        </div>
        {aside ? <div className="engagement-dashboard__section-aside">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

function BandBadge({ band }) {
  const tone = getBandTone(band);
  return (
    <span className="engagement-dashboard__band-badge" style={{ background: tone.surface, color: tone.color }}>
      {tone.label}
    </span>
  );
}

function ProgressStrip({ value, target = 100, color = "var(--color-primary)" }) {
  const numericValue = Number(value);
  const numericTarget = Number(target);
  const percent = Number.isFinite(numericValue) && Number.isFinite(numericTarget) && numericTarget > 0
    ? Math.max(0, Math.min(100, (numericValue / numericTarget) * 100))
    : 0;

  return (
    <div className="engagement-dashboard__progress-track" aria-hidden="true">
      <div className="engagement-dashboard__progress-fill" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

function MiniBarChart({ items = [], valueKey, color = "#2563eb", emptyLabel = "No data yet", labelFormatter, valueFormatter }) {
  if (!items.length) {
    return <div className="muted">{emptyLabel}</div>;
  }

  const numericValues = items.map((item) => Number(item?.[valueKey]) || 0);
  const max = Math.max(...numericValues, 1);

  return (
    <div className="engagement-dashboard__bars" role="img" aria-label="Trend bars">
      {items.map((item, index) => {
        const numericValue = Number(item?.[valueKey]) || 0;
        const height = Math.max(8, (numericValue / max) * 120);

        return (
          <div key={item?.key || `${item?.label || "item"}-${index}`} className="engagement-dashboard__bar-item">
            <span className="engagement-dashboard__bar-value">{valueFormatter ? valueFormatter(numericValue, item) : numericValue}</span>
            <div className="engagement-dashboard__bar-column-wrap">
              <div className="engagement-dashboard__bar-column" style={{ height, background: color }} />
            </div>
            <span className="engagement-dashboard__bar-label">{labelFormatter ? labelFormatter(item) : item?.label || "--"}</span>
          </div>
        );
      })}
    </div>
  );
}

function MiniSparkline({ items = [], valueKey, color = "#0f766e", emptyLabel = "No trend yet" }) {
  if (!items.length) {
    return <div className="muted">{emptyLabel}</div>;
  }

  const values = items.map((item) => Number(item?.[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(1, max - min);
  const width = 320;
  const height = 72;
  const step = items.length > 1 ? width / (items.length - 1) : width;

  const points = items.map((item, index) => {
    const value = Number(item?.[valueKey]) || 0;
    const x = index * step;
    const y = height - ((value - min) / range) * (height - 10) - 5;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="engagement-dashboard__sparkline-wrap">
      <svg className="engagement-dashboard__sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Trend sparkline">
        <polyline fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
      </svg>
      <div className="engagement-dashboard__sparkline-labels">
        <span>{items[0]?.label || "Start"}</span>
        <span>{items[items.length - 1]?.label || "Now"}</span>
      </div>
    </div>
  );
}

function resolveReminderTitle(item) {
  return item?.title || item?.subject || item?.metadata?.headline || String(item?.type || "Operational reminder").replace(/_/g, " ");
}

function resolveReminderBody(item) {
  return item?.message || item?.description || item?.metadata?.summary || item?.metadata?.reason || "Review this operational reminder from your learning dashboard.";
}

function ReminderList({ items = [], emptyTitle = "No reminders", emptyDescription = "There are no active reminders right now." }) {
  if (!items.length) {
    return <EmptyState icon="🔕" title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="engagement-dashboard__reminder-list">
      {items.map((item, index) => (
        <article key={item?.id || `${item?.type || "reminder"}-${index}`} className="engagement-dashboard__reminder-item">
          <div className="engagement-dashboard__reminder-topline">
            <strong>{resolveReminderTitle(item)}</strong>
            <span className={`engagement-dashboard__reminder-pill ${item?.isUnread ? "engagement-dashboard__reminder-pill--unread" : ""}`}>
              {item?.isUnread ? "Unread" : "Active"}
            </span>
          </div>
          <p className="engagement-dashboard__reminder-body">{resolveReminderBody(item)}</p>
          <div className="engagement-dashboard__reminder-meta">
            <span>{String(item?.type || "GENERAL").replace(/_/g, " ")}</span>
            <span>{formatDateTime(item?.createdAt || item?.updatedAt)}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function StudentScopeSwitcher({ items = [], selectedStudentId, onChange }) {
  if (items.length <= 1) {
    return null;
  }

  return (
    <div className="engagement-dashboard__switcher" role="tablist" aria-label="Student visibility scope">
      {items.map((item) => {
        const isActive = item?.studentId === selectedStudentId;
        return (
          <button
            key={item?.studentId}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`engagement-dashboard__switcher-tab ${isActive ? "engagement-dashboard__switcher-tab--active" : ""}`}
            onClick={() => onChange?.(item?.studentId)}
          >
            <strong>{item?.studentName || item?.studentCode || "Student"}</strong>
            <span>{[item?.relationship, item?.levelName].filter(Boolean).join(" • ") || item?.studentCode || "Linked profile"}</span>
          </button>
        );
      })}
    </div>
  );
}

export {
  BandBadge,
  MiniBarChart,
  MiniSparkline,
  ProgressStrip,
  ReminderList,
  SectionCard,
  StudentScopeSwitcher,
  formatBandLabel,
  formatDate,
  formatDateTime,
  formatPercent,
  formatRelativeDayLabel,
  formatScore,
  getBandTone
};