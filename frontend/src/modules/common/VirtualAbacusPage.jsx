import { useEffect, useState } from "react";
import { VirtualAbacus } from "../../components/VirtualAbacus";
import { StudentVirtualAbacusLearning } from "../student/StudentVirtualAbacusLearning";

const STANDARD_PLACE_MARKERS = [6, 3, 0, -3, -6];

function VirtualAbacusPage({
  learningEnabled = false,
  initialMode = "classic",
  showModeSwitch = true
}) {
  const resolveMode = () =>
    learningEnabled && initialMode === "learning" ? "learning" : "classic";

  const [mode, setMode] = useState(resolveMode);

  useEffect(() => {
    setMode(resolveMode());
  }, [initialMode, learningEnabled]);

  return (
    <div className="container virtual-abacus-page">
      <div className="page-head">
        <div>
          <h1>Virtual Abacus</h1>
          <div className="muted">
            {learningEnabled
              ? showModeSwitch
                ? "Choose free abacus practice or guided Practice & Learn mode."
                : "Guided Practice & Learn with the interactive Virtual Abacus."
              : "Practice using an on-screen abacus."}
          </div>
        </div>
      </div>

      {learningEnabled && showModeSwitch ? (
        <div className="card virtual-abacus-mode-switch" role="tablist" aria-label="Virtual Abacus mode">
          <button
            className={`button secondary ${mode === "classic" ? "va-is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={mode === "classic"}
            onClick={() => setMode("classic")}
          >
            Classic Abacus
          </button>
          <button
            className={`button secondary ${mode === "learning" ? "va-is-active" : ""}`}
            type="button"
            role="tab"
            aria-selected={mode === "learning"}
            onClick={() => setMode("learning")}
          >
            Practice & Learn
          </button>
        </div>
      ) : null}

      {mode === "learning" && learningEnabled ? (
        <StudentVirtualAbacusLearning />
      ) : (
        <div className="card">
          <VirtualAbacus
            columns={13}
            fractionalRods={6}
            markerExponents={STANDARD_PLACE_MARKERS}
          />
        </div>
      )}
    </div>
  );
}

export { VirtualAbacusPage };
