import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

function clampInt(value, { min, max }) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  const i = Math.trunc(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

function createInitialColumns(columnCount) {
  return Array.from({ length: columnCount }, () => ({ upper: false, lower: 0 }));
}

function digitValue(col) {
  return (col?.upper ? 5 : 0) + clampInt(col?.lower, { min: 0, max: 4 });
}

function computeIntegerValue(columns, unitsIndex) {
  // Only count rods on the left side (including Units). Ignore fractional rods on the right.
  let total = 0;
  for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
    const exponent = unitsIndex - colIndex;
    if (exponent < 0) continue;
    total += digitValue(columns[colIndex]) * Math.pow(10, exponent);
  }
  return total;
}

const PLACE_LABELS = {
  6: "Millions",
  5: "Hundred Thousands",
  4: "Ten Thousands",
  3: "Thousands",
  2: "Hundreds",
  1: "Tens",
  0: "Units",
  "-1": "Tenths",
  "-2": "Hundredths",
  "-3": "Thousandths",
  "-4": "Ten Thousandths",
  "-5": "Hundred Thousandths",
  "-6": "Millionths"
};

function placeLabelForExponent(exponent) {
  return PLACE_LABELS[exponent] || `10^${exponent}`;
}

function VirtualAbacus({ columns = 13, fractionalRods = 6 } = {}) {
  const columnCount = clampInt(columns, { min: 1, max: 15 });
  const fractionalCount = clampInt(fractionalRods, { min: 0, max: Math.max(0, columnCount - 1) });
  const unitsIndex = Math.max(0, Math.min(columnCount - 1, columnCount - 1 - fractionalCount));

  const [state, setState] = useState(() => createInitialColumns(columnCount));

  const unitsRodRef = useRef(null);

  useEffect(() => {
    // Keep state length in sync if columns changes.
    setState(createInitialColumns(columnCount));
  }, [columnCount]);

  const integerValue = useMemo(() => computeIntegerValue(state, unitsIndex), [state, unitsIndex]);

  // No horizontal scroll: board will size grid columns to fit available width.

  const onReset = () => setState(createInitialColumns(columnCount));

  const toggleUpper = (index) => {
    setState((prev) => {
      const next = [...prev];
      const curr = next[index];
      next[index] = { ...curr, upper: !curr.upper };
      return next;
    });
  };

  const setLower = (index, newCount) => {
    setState((prev) => {
      const next = [...prev];
      const curr = next[index];
      const normalized = clampInt(newCount, { min: 0, max: 4 });
      next[index] = { ...curr, lower: normalized };
      return next;
    });
  };

  // Bead travel distances (px)
  const UPPER_TRAVEL = 36;
  const LOWER_SLIDE = 52;

  return (
    <div className="virtual-abacus">
      <div className="virtual-abacus__top">
        <div className="virtual-abacus__value">
          <div className="muted">Value</div>
          <div className="virtual-abacus__valueNumber">{integerValue.toLocaleString()}</div>
        </div>
        <button className="button secondary" type="button" onClick={onReset} style={{ width: "auto" }}>
          Reset
        </button>
      </div>

      <div className="virtual-abacus__board" style={{ "--columns": columnCount }} role="group" aria-label="Virtual Abacus">
        {state.map((col, colIndex) => {
          const exponent = unitsIndex - colIndex;
          const placeLabel = placeLabelForExponent(exponent);
          const isUnits = colIndex === unitsIndex;
          const isFractional = exponent < 0;

          return (
            <div
              key={colIndex}
              ref={isUnits ? unitsRodRef : null}
              className={`virtual-abacus__rod ${isUnits ? "is-units" : ""} ${isFractional ? "is-decimal" : ""}`}
              aria-label={placeLabel}
            >
              {/* Upper deck — 1 heaven bead */}
              <div className="virtual-abacus__upper-deck">
                <button
                  type="button"
                  className="virtual-abacus__bead virtual-abacus__bead--upper"
                  style={{ transform: `translateY(${col.upper ? UPPER_TRAVEL : 0}px)` }}
                  onClick={() => toggleUpper(colIndex)}
                  aria-pressed={col.upper}
                  title={`Upper bead (5) — ${placeLabel}`}
                />
              </div>

              {/* Reckoning bar */}
              <div className="virtual-abacus__bar" aria-hidden="true" />

              {/* Lower deck — 4 earth beads */}
              <div className="virtual-abacus__lower-deck">
                {Array.from({ length: 4 }).map((_, beadIdx) => {
                  const beadNumber = beadIdx + 1;
                  const isActive = beadNumber <= col.lower;

                  return (
                    <button
                      key={beadIdx}
                      type="button"
                      className="virtual-abacus__bead virtual-abacus__bead--lower"
                      style={{ transform: `translateY(${isActive ? 0 : LOWER_SLIDE}px)` }}
                      onClick={() => setLower(colIndex, isActive ? beadIdx : beadNumber)}
                      aria-pressed={isActive}
                      title={`Lower bead (${beadNumber}) — ${placeLabel}`}
                    />
                  );
                })}
              </div>

              <div className="virtual-abacus__place">{placeLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { VirtualAbacus };
