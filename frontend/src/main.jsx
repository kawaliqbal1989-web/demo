import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AppProvider } from "./app/AppProvider";
import { App } from "./app/App";
import "./styles.css";

// Dev-only: suppress noisy browser/extension unhandled rejections for media play/pause races.
// (Common in injected scripts; safe to ignore when it's specifically the play()->pause AbortError.)
if (import.meta?.env?.DEV && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event?.reason;
    const name = reason?.name;
    const message = String(reason?.message || "");
    const isPlayPauseAbort = /play\(\) request was interrupted by a call to pause\(\)/i.test(message);
    if (name === "AbortError" && isPlayPauseAbort) {
      event.preventDefault();
    }
  });
}

// DEV-only: suppress noisy errors coming from browser extensions or injected scripts
// (e.g. giveFreely, chext_loader, quillbot). We filter by stack or filename to avoid
// hiding real application issues.
if (import.meta?.env?.DEV && typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event?.reason;
      const msg = String(reason?.message || "");
      const stack = String(reason?.stack || "");
      const isAsyncMessageChannelNoise = /A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received/i.test(msg);

      // Common indicators of extension-injected code
      const extIndicator = /(^|\b)(chrome-extension:|moz-extension:|safari-extension:|giveFreely|chext_|quillbot|givefreely)\b/i;

      if (extIndicator.test(stack) || extIndicator.test(msg) || isAsyncMessageChannelNoise) {
        // Quiet this noise — developer can still inspect Network/Console if needed.
        event.preventDefault();
      }
    } catch (e) {
      // noop
    }
  });

  window.addEventListener("error", (evt) => {
    try {
      const filename = String(evt?.filename || "");
      const message = String(evt?.message || "");
      const isAsyncMessageChannelNoise = /A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received/i.test(message);

      if (isAsyncMessageChannelNoise) {
        evt.preventDefault();
        return;
      }

      if (!filename) return;

      const extOrigin = filename.startsWith("chrome-extension://") || filename.startsWith("moz-extension://") || filename.startsWith("safari-extension://");
      const extName = /giveFreely|chext_|quillbot|givefreely/i.test(filename) || /giveFreely|chext_|quillbot|givefreely/i.test(message);

      if (extOrigin || extName) {
        evt.preventDefault();
      }
    } catch (e) {
      // noop
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
