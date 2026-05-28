function CenterEnrollmentsSummaryStrip({ rosterSummary, rosterTotal }) {
  return (
    <div
      className="card"
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))"
      }}
    >
      {[
        {
          label: "Loaded on page",
          value: `${rosterSummary.loadedRows} / ${rosterTotal}`,
          tone: "var(--color-text)"
        },
        {
          label: "Matched students",
          value: `${rosterSummary.matchedStudents} students`,
          tone: "var(--color-text)"
        },
        {
          label: "Student activity",
          value: `${rosterSummary.activeStudents} active / ${rosterSummary.inactiveStudents} inactive`,
          tone: "var(--color-text)"
        },
        {
          label: "Fee states",
          value: `${rosterSummary.paidStudents} paid / ${rosterSummary.pendingStudents} pending / ${rosterSummary.overdueStudents} overdue`,
          tone: "var(--color-text)"
        },
        {
          label: "Pending fee on page",
          value: `Rs ${rosterSummary.pendingFeeAmount.toLocaleString("en-IN")}`,
          tone: rosterSummary.pendingFeeAmount > 0 ? "#b45309" : "var(--color-text)"
        },
        {
          label: "Pending installments",
          value: `${rosterSummary.pendingInstallments} total / ${rosterSummary.overdueInstallments} overdue`,
          tone: rosterSummary.overdueInstallments > 0 ? "#b91c1c" : "var(--color-text)"
        },
        {
          label: "Fee setup missing",
          value: `${rosterSummary.notSetStudents} students`,
          tone: rosterSummary.notSetStudents > 0 ? "#6b7280" : "var(--color-text)"
        },
        {
          label: "Unassigned teacher",
          value: `${rosterSummary.unassignedTeachers} students`,
          tone: rosterSummary.unassignedTeachers > 0 ? "#b45309" : "var(--color-text)"
        }
      ].map((metric) => (
        <div
          key={metric.label}
          style={{
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "12px 14px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(0,0,0,0.02))"
          }}
        >
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{metric.label}</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: metric.tone }}>{metric.value}</div>
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--color-text-muted)" }}>
        Loaded count reflects the current page. Student and fee metrics reflect the full filtered result set.
      </div>
    </div>
  );
}

export { CenterEnrollmentsSummaryStrip };