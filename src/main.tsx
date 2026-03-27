import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Remove loading indicator once React mounts
const loadingEl = document.getElementById("debug-loading");
if (loadingEl) loadingEl.remove();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
