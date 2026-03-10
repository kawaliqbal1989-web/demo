function ErrorState({
  title = "Something went wrong",
  message = "An unexpected error occurred.",
  details = null,
  onRetry = null,
  retryLabel = "Retry",
  className = ""
}) {
  return (
    <div className={className} role="alert" aria-live="assertive">
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p className="error" style={{ margin: 0 }}>
          {message}
        </p>

        {details ? (
          <pre style={{ margin: 0, overflowX: "auto", padding: 12 }}>{details}</pre>
        ) : null}

        {onRetry ? (
          <button className="button" style={{ width: "auto" }} onClick={onRetry}>
            {retryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default ErrorState;
export { ErrorState };
