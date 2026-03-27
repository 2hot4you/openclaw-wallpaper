import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ─── Debug logger: writes to file + console ───────────
const LOG_LINES: string[] = [];
const _origLog = console.log.bind(console);
const _origError = console.error.bind(console);
const _origWarn = console.warn.bind(console);

function debugLog(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
  LOG_LINES.push(line);
  _origLog(...args);
  
  // Write to DOM element for visibility
  const logEl = document.getElementById("debug-log");
  if (logEl) {
    logEl.textContent = LOG_LINES.slice(-20).join("\n");
  }
}

// Override console.log/error/warn to capture everything
console.log = (...args: unknown[]) => { debugLog("[LOG]", ...args); };
console.error = (...args: unknown[]) => { debugLog("[ERR]", ...args); };
console.warn = (...args: unknown[]) => { debugLog("[WRN]", ...args); };

// ─── Add visible debug panel to page ───────────
const debugPanel = document.createElement("div");
debugPanel.id = "debug-log";
debugPanel.style.cssText = "position:fixed;bottom:0;left:0;right:0;height:200px;background:rgba(0,0,0,0.85);color:#0f0;font-family:monospace;font-size:11px;padding:8px;overflow-y:auto;z-index:99999;white-space:pre-wrap;pointer-events:none;";
document.body.appendChild(debugPanel);

debugLog("main.tsx loaded");
debugLog("window.location:", window.location.href);
debugLog("document.readyState:", document.readyState);

// Remove loading indicator once React mounts
const loadingEl = document.getElementById("debug-loading");
if (loadingEl) loadingEl.remove();

debugLog("About to render React app...");

try {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  debugLog("React render called successfully");
} catch (err) {
  debugLog("React render FAILED:", err);
}
