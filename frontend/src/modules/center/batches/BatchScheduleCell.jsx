function BatchScheduleCell({ batch }) {
  const summary = String(batch?.scheduleSummary || "").trim();

  return (
    <div className="batch-schedule-cell">
      <div className="batch-schedule-cell__summary">{summary || "Schedule pending"}</div>
      <div className="batch-schedule-cell__meta">
        {batch?.hasWeekday ? <span className="batch-pill">Weekday</span> : null}
        {batch?.hasWeekend ? <span className="batch-pill">Weekend</span> : null}
        {!batch?.hasWeekday && !batch?.hasWeekend ? <span className="batch-pill batch-pill--muted">Unscheduled</span> : null}
      </div>
    </div>
  );
}

export { BatchScheduleCell };