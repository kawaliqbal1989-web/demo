import { useEffect, useState } from "react";
import { subscribe } from "../services/loadingStore";

function GlobalLoadingBar() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    return subscribe((count) => setActive(count));
  }, []);

  if (active <= 0) {
    return null;
  }

  return <div className="global-loading-bar" aria-label="Loading" />;
}

export { GlobalLoadingBar };
