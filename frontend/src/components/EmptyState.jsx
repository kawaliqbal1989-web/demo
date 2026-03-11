/**
 * EmptyState — illustrated placeholder for empty data views.
 *
 * Usage:
 *  <EmptyState
 *    icon="📋"
 *    title="No students found"
 *    description="Try adjusting your filters or add a new student."
 *    action={{ label: "Add Student", onClick: () => {} }}
 *  />
 */

function EmptyState({ icon = "📭", title = "Nothing here yet", description, action }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3 className="empty-state__title">{title}</h3>
      {description ? <p className="empty-state__desc">{description}</p> : null}
      {action ? (
        <button
          className="button"
          style={{ width: "auto", marginTop: 4 }}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export { EmptyState };
