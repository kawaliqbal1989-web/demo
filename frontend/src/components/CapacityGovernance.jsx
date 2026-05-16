import { useAuth } from "../hooks/useAuth";
import { ErrorState } from "./ErrorState";
import { SkeletonLoader } from "./SkeletonLoader";
import {
  buildCapacityLimitMessage,
  deriveCapacityMetricStatus,
  deriveCenterCapacityStatus,
  formatCapacityUsage,
  formatRemainingSeats
} from "../utils/capacityGovernance";
import { getFriendlyErrorMessage } from "../utils/apiErrors";

function buildCapacityRequestHref(snapshot, resourceType) {
  const metric = resourceType === "teachers" ? snapshot?.usage?.teachers : snapshot?.usage?.students;
  const resourceLabel = resourceType === "teachers" ? "Teacher" : "Student";
  const subject = encodeURIComponent(`${snapshot?.center?.name || "Center"} ${resourceLabel.toLowerCase()} capacity review`);
  const body = encodeURIComponent(
    [
      `Center: ${snapshot?.center?.name || "Unknown center"}`,
      `Resource: ${resourceLabel}`,
      `Usage: ${formatCapacityUsage(metric)}`,
      `Status: ${deriveCapacityMetricStatus(metric).label}`,
      `Message: ${buildCapacityLimitMessage(metric, resourceLabel)}`,
      `Recommended action: ${snapshot?.summary?.recommendedAction || "Review configured limits"}`
    ].join("\n")
  );

  return `mailto:?subject=${subject}&body=${body}`;
}

function CapacityStatusBadge({ status }) {
  if (!status) {
    return null;
  }

  return <span className={`capacity-status-badge capacity-status-badge--${status.key}`}>{status.label}</span>;
}

function CapacityProgressCard({ title, metric, subtitle = null }) {
  const status = deriveCapacityMetricStatus(metric);
  const utilizationPercent = Math.max(0, Math.min(status.utilizationPercent ?? 0, 100));
  const progressLabel = status.utilizationPercent == null ? "Unmanaged" : `${status.utilizationPercent.toFixed(1)}% utilized`;

  return (
    <article className={`capacity-card capacity-card--${status.key}`}>
      <div className="capacity-card__header">
        <div>
          <div className="capacity-card__eyebrow">{title}</div>
          <div className="capacity-card__value">{formatCapacityUsage(metric)}</div>
        </div>
        <CapacityStatusBadge status={status} />
      </div>
      <div className="capacity-card__meta-row">
        <span>{formatRemainingSeats(metric)}</span>
        <span>{progressLabel}</span>
      </div>
      <div
        className="capacity-progress"
        role="progressbar"
        aria-label={`${title} utilization`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(utilizationPercent)}
      >
        <div className={`capacity-progress__bar capacity-progress__bar--${status.key}`} style={{ width: `${utilizationPercent}%` }} />
      </div>
      <p className="capacity-card__message">{buildCapacityLimitMessage(metric, title.slice(0, -1))}</p>
      {subtitle ? <div className="capacity-card__subtitle">{subtitle}</div> : null}
    </article>
  );
}

function CapacityInlineNotice({ title, metric, loading = false, error = null, onRetry = null, requestHref = "#" }) {
  if (loading) {
    return <SkeletonLoader variant="detail" />;
  }

  if (error) {
    return (
      <div className="card capacity-inline-notice capacity-inline-notice--fallback" role="status">
        <div>
          <div className="capacity-inline-notice__title">{title}</div>
          <p className="capacity-inline-notice__message">
            Capacity visibility is temporarily unavailable. Actions remain enforced by the backend.
          </p>
        </div>
        {onRetry ? (
          <button className="button secondary" style={{ width: "auto" }} onClick={onRetry}>
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!metric) {
    return null;
  }

  const status = deriveCapacityMetricStatus(metric);

  return (
    <div className={`card capacity-inline-notice capacity-inline-notice--${status.key}`} role="status">
      <div>
        <div className="capacity-inline-notice__title-row">
          <div className="capacity-inline-notice__title">{title}</div>
          <CapacityStatusBadge status={status} />
        </div>
        <div className="capacity-inline-notice__usage">{formatCapacityUsage(metric)} • {formatRemainingSeats(metric)}</div>
        <p className="capacity-inline-notice__message">{buildCapacityLimitMessage(metric, title.replace(/ seats$/i, ""))}</p>
      </div>
      <a className="button secondary" style={{ width: "auto" }} href={requestHref}>
        {status.key === "healthy" ? "Review limits" : "Request seats"}
      </a>
    </div>
  );
}

function CenterCapacityPanel({ snapshot, loading = false, error = null, onRetry = null }) {
  const { role } = useAuth();

  if (role !== "CENTER") {
    return null;
  }

  if (loading) {
    return <SkeletonLoader variant="card" count={2} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Capacity governance unavailable"
        message={getFriendlyErrorMessage(error) || "Unable to load center capacity right now."}
        onRetry={onRetry}
        retryLabel="Retry capacity"
      />
    );
  }

  if (!snapshot) {
    return null;
  }

  const overallStatus = deriveCenterCapacityStatus(snapshot);
  const studentMetric = snapshot?.usage?.students;
  const teacherMetric = snapshot?.usage?.teachers;

  return (
    <section className="capacity-panel card">
      <div className="capacity-panel__header">
        <div>
          <div className="capacity-panel__title-row">
            <h3 className="capacity-panel__title">Capacity governance</h3>
            <CapacityStatusBadge status={overallStatus} />
          </div>
          <p className="capacity-panel__description">
            Live seat visibility from center capacity governance. Final enforcement remains server-side.
          </p>
        </div>
        <div className="capacity-panel__summary">
          <div className="capacity-panel__summary-value">{snapshot?.summary?.recommendedAction || "Capacity healthy"}</div>
          <div className="capacity-panel__summary-label">Recommended action</div>
        </div>
      </div>

      <div className="capacity-panel__grid">
        <CapacityProgressCard title="Students" metric={studentMetric} subtitle="Admissions and imports consume student seats." />
        <CapacityProgressCard title="Teachers" metric={teacherMetric} subtitle="Active teachers consume governed teacher seats." />
      </div>

      <div className="capacity-panel__footer">
        <div className="capacity-panel__remaining">
          <div className="capacity-panel__remaining-item">
            <span className="capacity-panel__remaining-label">Student seats</span>
            <strong>{formatRemainingSeats(studentMetric)}</strong>
          </div>
          <div className="capacity-panel__remaining-item">
            <span className="capacity-panel__remaining-label">Teacher seats</span>
            <strong>{formatRemainingSeats(teacherMetric)}</strong>
          </div>
        </div>
        <div className="capacity-panel__actions">
          <a className="button secondary" style={{ width: "auto" }} href={buildCapacityRequestHref(snapshot, "students")}>
            Request student seats
          </a>
          <a className="button secondary" style={{ width: "auto" }} href={buildCapacityRequestHref(snapshot, "teachers")}>
            Request teacher seats
          </a>
        </div>
      </div>
    </section>
  );
}

export {
  CapacityInlineNotice,
  CapacityProgressCard,
  CapacityStatusBadge,
  CenterCapacityPanel,
  buildCapacityRequestHref
};