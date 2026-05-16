import { EmptyState } from "../../../components/EmptyState";
import { ErrorState } from "../../../components/ErrorState";
import { getFriendlyErrorMessage } from "../../../utils/apiErrors";
import { formatDateTime } from "../utils/formatters";

function resolveSourceLabel(meta) {
  if (!meta?.source) {
    return null;
  }

  return meta.source.mode === "snapshot" ? "Snapshot-backed" : "Live fallback";
}

function WidgetShell({
  title,
  description,
  meta,
  hasData = false,
  loading = false,
  loadingFallback = null,
  error = null,
  onRetry = null,
  isEmpty = false,
  emptyTitle = "No data available",
  emptyDescription = "Try adjusting the selected filters or refresh the dashboard.",
  actions = null,
  className = "",
  children
}) {
  const sourceLabel = resolveSourceLabel(meta);
  const generatedAt = meta?.generatedAt ? formatDateTime(meta.generatedAt) : null;

  return (
    <section className={`card bpdash-widget ${className}`.trim()}>
      <div className="bpdash-widget__header">
        <div>
          <div className="bpdash-widget__title-row">
            <h3 className="bpdash-widget__title">{title}</h3>
            {sourceLabel ? <span className="bpdash-widget__badge">{sourceLabel}</span> : null}
          </div>
          {description ? <p className="bpdash-widget__description">{description}</p> : null}
          {generatedAt ? <div className="bpdash-widget__meta">Updated {generatedAt}</div> : null}
        </div>
        {actions ? <div className="bpdash-widget__actions">{actions}</div> : null}
      </div>

      {loading ? loadingFallback : null}

      {!loading && error && !hasData ? (
        <ErrorState
          title={`${title} unavailable`}
          message={getFriendlyErrorMessage(error) || "Unable to load this widget right now."}
          onRetry={onRetry}
          retryLabel="Retry widget"
        />
      ) : null}

      {!loading && error && hasData ? (
        <div className="bpdash-widget__inline-error" role="alert">
          <span>{getFriendlyErrorMessage(error) || "Unable to refresh this widget."}</span>
          {onRetry ? (
            <button className="button secondary" style={{ width: "auto" }} onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      {!loading && !error && isEmpty ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : null}

      {!loading && !error && !isEmpty ? children : null}
      {!loading && error && hasData ? children : null}
    </section>
  );
}

export { WidgetShell };