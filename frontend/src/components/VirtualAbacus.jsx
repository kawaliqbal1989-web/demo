import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

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

function cloneColumns(columns) {
  return columns.map((col) => ({ upper: Boolean(col?.upper), lower: clampInt(col?.lower, { min: 0, max: 4 }) }));
}

function sameColumns(a, b) {
  return a.length === b.length && a.every((col, index) => (
    Boolean(col?.upper) === Boolean(b[index]?.upper)
    && clampInt(col?.lower, { min: 0, max: 4 }) === clampInt(b[index]?.lower, { min: 0, max: 4 })
  ));
}

function digitValue(col) {
  return (col?.upper ? 5 : 0) + clampInt(col?.lower, { min: 0, max: 4 });
}

function computeAbacusValue(columns, unitsIndex, fractionalCount) {
  const scale = Math.pow(10, fractionalCount);
  let scaledTotal = 0;

  for (let colIndex = 0; colIndex < columns.length; colIndex += 1) {
    const exponent = unitsIndex - colIndex;
    const scaledExponent = exponent + fractionalCount;

    if (scaledExponent < 0) continue;

    scaledTotal +=
      digitValue(columns[colIndex]) *
      Math.pow(10, scaledExponent);
  }

  return scaledTotal / scale;
}

function columnsFromValue(value, columnCount, unitsIndex, fractionalCount) {
  const numericValue = Math.max(0, Number(value) || 0);
  const scale = Math.pow(10, fractionalCount);
  const scaledValue = Math.round(numericValue * scale);

  return Array.from({ length: columnCount }, (_, colIndex) => {
    const exponent = unitsIndex - colIndex;
    const scaledExponent = exponent + fractionalCount;
    const place = scaledExponent >= 0 ? Math.pow(10, scaledExponent) : 1;
    const digit = scaledExponent >= 0 ? Math.floor(scaledValue / place) % 10 : 0;

    return {
      upper: digit >= 5,
      lower: digit % 5
    };
  });
}

function formatAbacusValue(value, fractionalCount) {
  return new Intl.NumberFormat("en-US", {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionalCount
  }).format(value);
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
  "-6": "Millionths",
  "-7": "Ten Millionths"
};

function placeLabelForExponent(exponent) {
  return PLACE_LABELS[exponent] || `10^${exponent}`;
}

const VirtualAbacus = forwardRef(function VirtualAbacus({
  columns = 13,
  fractionalRods = 6,
  markerExponents = [],
  showValue = true,
  showLabels = true,
  showReset = true,
  interactive = true,
  highlightUnits = false,
  highlightExponents = [],
  onValueChange,
  onRodSelect,
  onMove
} = {}, ref) {
  const columnCount = clampInt(columns, { min: 1, max: 15 });
  const fractionalCount = clampInt(fractionalRods, { min: 0, max: Math.max(0, columnCount - 1) });
  const unitsIndex = Math.max(0, Math.min(columnCount - 1, columnCount - 1 - fractionalCount));

  const [state, setState] = useState(() => createInitialColumns(columnCount));
  const historyRef = useRef({ past: [], future: [] });
  const unitsRodRef = useRef(null);

  useEffect(() => {
    historyRef.current = { past: [], future: [] };
    setState(createInitialColumns(columnCount));
  }, [columnCount]);

  const abacusValue = useMemo(
    () => computeAbacusValue(state, unitsIndex, fractionalCount),
    [state, unitsIndex, fractionalCount]
  );

  const markerExponentSet = useMemo(
    () =>
      new Set(
        (Array.isArray(markerExponents) ? markerExponents : [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value))
      ),
    [markerExponents]
  );

  const highlightedExponentSet = useMemo(
    () =>
      new Set(
        (Array.isArray(highlightExponents) ? highlightExponents : [])
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value))
      ),
    [highlightExponents]
  );

  useEffect(() => {
    onValueChange?.(abacusValue, cloneColumns(state));
  }, [abacusValue, onValueChange, state]);

  const commitState = (nextState, { record = true } = {}) => {
    const normalized = cloneColumns(nextState);

    setState((prev) => {
      if (sameColumns(prev, normalized)) return prev;

      if (record) {
        const history = historyRef.current;
        history.past = [...history.past.slice(-49), cloneColumns(prev)];
        history.future = [];
      }

      return normalized;
    });
  };

  const loadValue = (value) => {
    historyRef.current = { past: [], future: [] };
    commitState(columnsFromValue(value, columnCount, unitsIndex, fractionalCount), { record: false });
  };

  const onReset = () => commitState(createInitialColumns(columnCount));

  const undo = () => {
    setState((prev) => {
      const history = historyRef.current;
      if (!history.past.length) return prev;
      const previous = history.past.pop();
      history.future = [cloneColumns(prev), ...history.future.slice(0, 49)];
      return cloneColumns(previous);
    });
  };

  const redo = () => {
    setState((prev) => {
      const history = historyRef.current;
      if (!history.future.length) return prev;
      const next = history.future.shift();
      history.past = [...history.past.slice(-49), cloneColumns(prev)];
      return cloneColumns(next);
    });
  };

  useImperativeHandle(ref, () => ({
    getValue: () => abacusValue,
    getState: () => cloneColumns(state),
    loadValue,
    reset: onReset,
    undo,
    redo,
    clearHistory: () => {
      historyRef.current = { past: [], future: [] };
    }
  }), [abacusValue, columnCount, fractionalCount, state, unitsIndex]);

  const reportRod = (index, col) => {
    const exponent = unitsIndex - index;
    const digit = digitValue(col);
    onRodSelect?.({
      index,
      rodNumber: index + 1,
      exponent,
      placeLabel: placeLabelForExponent(exponent),
      digit,
      contribution: digit * Math.pow(10, exponent)
    });
  };

  const reportMove = ({
    type,
    index,
    beforeState,
    afterState
  }) => {
    if (!onMove) return;

    const exponent = unitsIndex - index;
    const beforeCol = beforeState[index];
    const afterCol = afterState[index];

    onMove({
      type,
      index,
      rodNumber: index + 1,
      exponent,
      placeLabel: placeLabelForExponent(exponent),
      beforeDigit: digitValue(beforeCol),
      afterDigit: digitValue(afterCol),
      beforeValue: computeAbacusValue(
        beforeState,
        unitsIndex,
        fractionalCount
      ),
      afterValue: computeAbacusValue(
        afterState,
        unitsIndex,
        fractionalCount
      ),
      beforeState: cloneColumns(beforeState),
      afterState: cloneColumns(afterState),
      occurredAt: Date.now()
    });
  };

  const toggleUpper = (index) => {
    if (!interactive) return;

    const before = cloneColumns(state);
    const next = cloneColumns(state);

    next[index] = {
      ...next[index],
      upper: !next[index].upper
    };

    commitState(next);
    reportRod(index, next[index]);

    reportMove({
      type: "upper",
      index,
      beforeState: before,
      afterState: next
    });
  };

  const setLower = (index, newCount) => {
    if (!interactive) return;

    const nextCount = clampInt(
      newCount,
      { min: 0, max: 4 }
    );

    if (nextCount === state[index].lower) {
      return;
    }

    const before = cloneColumns(state);
    const next = cloneColumns(state);

    next[index] = {
      ...next[index],
      lower: nextCount
    };

    commitState(next);
    reportRod(index, next[index]);

    reportMove({
      type: "lower",
      index,
      beforeState: before,
      afterState: next
    });
  };

  const UPPER_TRAVEL = 36;
  const LOWER_SLIDE = 52;

  return (
    <div className="virtual-abacus">
      <div className="virtual-abacus__top">
        <div className="virtual-abacus__value">
          <div className="muted">Value</div>
          <div className="virtual-abacus__valueNumber">
            {showValue ? formatAbacusValue(abacusValue, fractionalCount) : "Hidden"}
          </div>
        </div>
        {showReset ? (
          <button className="button secondary" type="button" onClick={onReset} style={{ width: "auto" }}>
            Reset
          </button>
        ) : null}
      </div>

      <div className="virtual-abacus__board" style={{ "--columns": columnCount }} role="group" aria-label="Virtual Abacus">
        {state.map((col, colIndex) => {
          const exponent = unitsIndex - colIndex;
          const placeLabel = placeLabelForExponent(exponent);
          const isUnits = colIndex === unitsIndex;
          const isFractional = exponent < 0;
          const hasPlaceMarker = markerExponentSet.has(exponent);

          return (
            <div
              key={colIndex}
              ref={isUnits ? unitsRodRef : null}
              className={`virtual-abacus__rod ${
                highlightUnits && isUnits ? "is-units" : ""
              } ${
                highlightedExponentSet.has(exponent)
                  ? "is-coach-highlight"
                  : ""
              } ${
                isUnits && fractionalCount > 0 ? "has-decimals" : ""
              } ${
                isFractional ? "is-decimal" : ""
              }`}
              aria-label={placeLabel}
            >
              <div className="virtual-abacus__upper-deck">
                <button
                  type="button"
                  className="virtual-abacus__bead virtual-abacus__bead--upper"
                  style={{ transform: `translateY(${col.upper ? UPPER_TRAVEL : 0}px)` }}
                  onClick={() => toggleUpper(colIndex)}
                  aria-pressed={col.upper}
                  title={`Upper bead (5) — ${placeLabel}`}
                  disabled={!interactive}
                />
              </div>

              <div
                className="virtual-abacus__bar"
                aria-hidden="true"
                style={{ position: "relative" }}
              >
                {hasPlaceMarker ? (
                  <span
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "#ffffff",
                      border: "1px solid rgba(0, 0, 0, 0.22)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.25)",
                      transform: "translate(-50%, -50%)",
                      zIndex: 3,
                      pointerEvents: "none"
                    }}
                  />
                ) : null}
              </div>

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
                      disabled={!interactive}
                    />
                  );
                })}
              </div>

              {showLabels ? <div className="virtual-abacus__place">{placeLabel}</div> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

export { VirtualAbacus };
