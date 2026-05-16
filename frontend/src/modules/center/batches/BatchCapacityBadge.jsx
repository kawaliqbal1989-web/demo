function BatchCapacityBadge({ currentStudents = 0, maxStudents = null, occupancyPercentage = null }) {
  const current = Number(currentStudents || 0);
  const max = maxStudents === null || maxStudents === undefined ? null : Number(maxStudents);
  const percent = occupancyPercentage === null || occupancyPercentage === undefined
    ? null
    : Number(occupancyPercentage);

  let tone = "neutral";
  if (percent !== null && percent >= 100) tone = "danger";
  else if (percent !== null && percent >= 85) tone = "warning";
  else if (percent !== null) tone = "success";

  return (
    <div className={`batch-capacity batch-capacity--${tone}`}>
      <div className="batch-capacity__meta">
        <strong>{max ? `${current} / ${max}` : `${current} students`}</strong>
        <span>{percent === null ? "Open" : `${percent}% full`}</span>
      </div>
      <div className="batch-capacity__track" aria-hidden="true">
        <span className="batch-capacity__fill" style={{ width: `${Math.max(0, Math.min(percent ?? 0, 100))}%` }} />
      </div>
    </div>
  );
}

export { BatchCapacityBadge };