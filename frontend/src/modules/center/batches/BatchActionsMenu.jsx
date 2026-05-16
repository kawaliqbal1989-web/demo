import { useEffect, useRef, useState } from "react";

function BatchActionsMenu({ actions = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointer(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointer);
    return () => window.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  return (
    <div className="batch-actions-menu" ref={rootRef}>
      <button
        className="button secondary batch-actions-menu__trigger"
        style={{ width: "auto" }}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        Actions
      </button>

      {open ? (
        <div className="batch-actions-menu__panel">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={`batch-actions-menu__item${action.danger ? " is-danger" : ""}`}
              onClick={() => {
                setOpen(false);
                action.onClick?.();
              }}
              disabled={action.disabled}
            >
              <span>{action.label}</span>
              {action.hint ? <small>{action.hint}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { BatchActionsMenu };