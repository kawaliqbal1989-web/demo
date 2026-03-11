import { useState, useRef, useEffect, useMemo, useCallback } from "react";

/**
 * SearchableDropdown — autocomplete select with keyboard navigation.
 *
 * Props:
 *  options     — [{ value, label }]
 *  value       — selected value
 *  onChange    — (value) => void
 *  placeholder — input placeholder
 *  disabled    — boolean
 */

function SearchableDropdown({
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const pick = useCallback(
    (opt) => {
      onChange(opt.value);
      setOpen(false);
      setQuery("");
    },
    [onChange]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (!open) {
        if (e.key === "ArrowDown" || e.key === "Enter") {
          e.preventDefault();
          setOpen(true);
        }
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) pick(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    },
    [open, filtered, activeIndex, pick]
  );

  return (
    <div className="searchable-dropdown" ref={wrapRef}>
      <input
        ref={inputRef}
        className="input"
        type="text"
        value={open ? query : selected?.label || ""}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {open && (
        <div className="searchable-dropdown__menu" role="listbox">
          {filtered.length === 0 ? (
            <div className="searchable-dropdown__empty">No matches</div>
          ) : (
            filtered.map((opt, i) => (
              <div
                key={opt.value}
                className={[
                  "searchable-dropdown__option",
                  i === activeIndex ? "searchable-dropdown__option--active" : "",
                  opt.value === value ? "searchable-dropdown__option--selected" : "",
                ].join(" ")}
                onClick={() => pick(opt)}
                onMouseEnter={() => setActiveIndex(i)}
                role="option"
                aria-selected={opt.value === value}
              >
                {opt.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export { SearchableDropdown };
