/**
 * StepWizard — multi-step form header with step indicators.
 *
 * Usage:
 *  <StepWizard
 *    steps={["Details", "Schedule", "Review"]}
 *    current={1}
 *  />
 */

function StepWizard({ steps = [], current = 0 }) {
  return (
    <div className="step-wizard__header" role="navigation" aria-label="Form steps">
      {steps.map((label, i) => {
        let state = "upcoming";
        if (i < current) state = "complete";
        if (i === current) state = "active";

        return (
          <div
            key={i}
            className={`step-wizard__step step-wizard__step--${state}`}
            aria-current={state === "active" ? "step" : undefined}
          >
            <div className="step-wizard__dot">
              {state === "complete" ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span className="step-wizard__label">{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export { StepWizard };
