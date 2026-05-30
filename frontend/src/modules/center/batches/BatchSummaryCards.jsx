import { useMemo } from "react";

function BatchSummaryCards({ items = [], total = 0, refreshing = false }) {
  const cards = useMemo(() => {
    const operational = items.filter((item) => ["ACTIVE", "UPCOMING", "TRIAL"].includes(item.status)).length;
    const full = items.filter((item) => Number(item.occupancyPercentage || 0) >= 100).length;
    const unassigned = items.filter((item) => !item.hasTeacher).length;
    const archived = items.filter((item) => item.status === "ARCHIVED").length;

    return [
      { label: "Total", value: total, tone: "neutral", hint: "Server-side matches" },
      { label: "Operational", value: operational, tone: "success", hint: "Active, upcoming, trial" },
      { label: "At capacity", value: full, tone: full ? "warning" : "neutral", hint: "Visible rows" },
      { label: "Needs teacher", value: unassigned || archived, tone: unassigned ? "danger" : "neutral", hint: unassigned ? "Unassigned on page" : "No staffing gaps" }
    ];
  }, [items, total]);

  return (
    <div className="batch-summary-grid" aria-busy={refreshing}>
      {cards.map((card) => (
        <article key={card.label} className={`batch-summary-card batch-summary-card--${card.tone}`}>
          <span className="batch-summary-card__label">{card.label}</span>
          <strong className="batch-summary-card__value">{card.value}</strong>
          <span className="batch-summary-card__hint">{card.hint}</span>
        </article>
      ))}
    </div>
  );
}

export { BatchSummaryCards };