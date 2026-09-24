import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// When a new version is deployed, this asks the person to refresh instead
// of silently serving stale cached code forever.
registerSW({
  onNeedRefresh() {
    if (confirm("A new version of Hunter System is available. Reload now?")) {
      window.location.reload();
    }
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);