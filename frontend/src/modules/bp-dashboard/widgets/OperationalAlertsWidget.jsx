import { memo, useMemo } from "react";
import { SkeletonLoader } from "../../../components/SkeletonLoader";
import { WidgetShell } from "../components/WidgetShell";
import { formatAlertType, getAlertSeverityTone } from "./franchise-detail.shared";

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

const OperationalAlertsWidget = memo(function OperationalAlertsWidget({ resource }) {
  const groupedAlerts = useMemo(() => {
    const groups = new Map();

    for (const severity of SEVERITY_ORDER) {
      groups.set(severity, []);
    }

    for (const item of resource?.items || []) {
      const severity = getAlertSeverityTone(item?.severity);
      groups.get(severity).push(item);
    }

    return SEVERITY_ORDER.map((severity) => ({
      items: groups.get(severity) || [],
      severity
    })).filter((group) => group.items.length > 0);
  }, [resource?.items]);

  const isEmpty = !resource?.loading && !resource?.error && !resource?.items?.length;

  return (
    <WidgetShell
      title="Operational Alerts"
      description="Actionable signals for attendance, collections, admissions, growth, and unhealthy center conditions in this franchise."
      meta={resource?.meta}
      hasData={resource?.hasData}
      loading={resource?.loading}
      loadingFallback={<SkeletonLoader variant="detail" />}
      error={resource?.error}
      onRetry={resource?.retry}
      isEmpty={isEmpty}
      emptyTitle="No operational alerts"
      emptyDescription="This franchise has no active operational alerts in the current analytics window."
    >
      <div className="bpdash-alert-summary">
        <div className="bpdash-summary-card">
          <span>Total alerts</span>
          <strong>{resource?.summary?.totalAlerts || 0}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>Critical</span>
          <strong>{resource?.summary?.criticalCount || 0}</strong>
        </div>
        <div className="bpdash-summary-card">
          <span>High</span>
          <strong>{resource?.summary?.highCount || 0}</strong>
        </div>
      </div>

      <div className="bpdash-alert-groups">
        {groupedAlerts.map((group) => (
          <section key={group.severity} className="bpdash-alert-group">
            <div className="bpdash-alert-group__header">
              <span className={`bpdash-severity-badge bpdash-severity-badge--${group.severity}`}>{group.severity}</span>
              <strong>{group.items.length} active</strong>
            </div>
            <div className="bpdash-alert-list">
              {group.items.map((item) => (
                <article key={item.id || `${item.centerId}-${item.type}`} className="bpdash-alert-card">
                  <div className="bpdash-alert-card__header">
                    <div>
                      <div className="bpdash-table__primary">{item.title || formatAlertType(item.type)}</div>
                      <div className="bpdash-table__secondary">{item.centerName || item.centerCode || item.centerId || "Franchise center"}</div>
                    </div>
                    <span className={`bpdash-severity-badge bpdash-severity-badge--${getAlertSeverityTone(item.severity)}`}>
                      {getAlertSeverityTone(item.severity)}
                    </span>
                  </div>
                  <p className="bpdash-alert-card__body">{item.description || item.message || item.reason || "Review this alert in the franchise operations flow."}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </WidgetShell>
  );
});

export { OperationalAlertsWidget };