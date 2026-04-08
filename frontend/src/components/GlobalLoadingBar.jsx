import { useEffect, useState } from "react";
import { subscribe } from "../services/loadingStore";

function GlobalLoadingBar() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    return subscribe((count) => setActive(count));
  }, []);

  return (
    <div
      className={`global-loading-bar ${active > 0 ? "global-loading-bar--active" : ""}`}
      aria-hidden={active <= 0}
      aria-label={active > 0 ? "Loading" : undefined}
    />
  );
}

export { GlobalLoadingBar };
