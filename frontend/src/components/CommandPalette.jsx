import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getMenuForRole } from "../utils/roleMenu";

/**
 * CommandPalette — Ctrl+K global search for pages & quick navigation.
 *
 * Opens with Ctrl+K (or Cmd+K on Mac).
 * Shows all menu items for the current role, filtered by search query.
 */

function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const { role } = useAuth();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const items = useMemo(() => {
    const menu = getMenuForRole(role);
    return menu.filter((m) => m.to && m.label);
  }, [role]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      // Small delay so the input is mounted first
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const go = useCallback(
    (item) => {
      if (item?.to) {
        navigate(item.to);
        onClose();
      }
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % (filtered.length || 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + (filtered.length || 1)) % (filtered.length || 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        go(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, activeIndex, go, onClose]
  );

  if (!open) return null;

  return (
    <div className="cmd-palette-overlay" onClick={onClose}>
      <div
        className="cmd-palette"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quick navigation"
      >
        <div className="cmd-palette__input-wrap">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="cmd-palette__input"
            type="text"
            placeholder="Search pages, actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          <span className="cmd-palette__kbd">Esc</span>
        </div>

        <div className="cmd-palette__results">
          {filtered.length === 0 ? (
            <div className="cmd-palette__empty">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.to}
                className={`cmd-palette__item ${i === activeIndex ? "cmd-palette__item--active" : ""}`}
                onClick={() => go(item)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="cmd-palette__item-icon">
                  {item.label.match(/^\p{Emoji_Presentation}/u)?.[0] || "→"}
                </span>
                <span>{item.label.replace(/^\p{Emoji_Presentation}\s*/u, "")}</span>
              </div>
            ))
          )}
        </div>

        <div className="cmd-palette__footer">
          <span><span className="cmd-palette__kbd">↑↓</span> navigate</span>
          <span><span className="cmd-palette__kbd">↵</span> open</span>
          <span><span className="cmd-palette__kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}

export { CommandPalette };
