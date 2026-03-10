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

function placeLabelForExponent(exponent) {
  if (exponent === 0) return "Units";

  const positive = [
    "Tens",
    "Hundreds",
    "Thousands",
    "Ten Thousands",
    "Hundred Thousands",
    "Millions",
    "Ten Millions",
    "Hundred Millions",
    "Billions"
  ];

  const negative = [
    "Tenths",
    "Hundredths",
    "Thousandths",
    "Ten Thousandths",
    "Hundred Thousandths",
    "Millionths",
    "Ten Millionths",
    "Hundred Millionths"
  ];

  if (exponent > 0) return positive[exponent - 1] || `10^${exponent}`;
  return negative[Math.abs(exponent) - 1] || `10^${exponent}`;
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
              <button
                type="button"
                className={`virtual-abacus__bead virtual-abacus__bead--upper ${col.upper ? "is-active" : ""}`}
                onClick={() => toggleUpper(colIndex)}
                aria-pressed={col.upper}
                title={`Upper bead (5) — ${placeLabel}`}
              />

              <div className="virtual-abacus__bar" aria-hidden="true" />

              <div className="virtual-abacus__lower">
                {Array.from({ length: 4 }).map((_, beadIdx) => {
                  const beadNumber = beadIdx + 1;
                  const isActive = beadNumber <= col.lower;

                  return (
                    <button
                      key={beadIdx}
                      type="button"
                      className={`virtual-abacus__bead virtual-abacus__bead--lower ${isActive ? "is-active" : ""}`}
                      onClick={() => setLower(colIndex, isActive ? beadIdx : beadNumber)}
                      aria-pressed={isActive}
                      title={`Lower bead (${beadNumber}) — ${placeLabel}`}
                    />
                  );
                })}
              </div>

              <div className="virtual-abacus__place muted">{placeLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { VirtualAbacus };
