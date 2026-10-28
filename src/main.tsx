import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySystemBarStyle } from "./lib/systemBars";
import { installErrorReporting } from "./lib/errorReport";
import { startAppUpdates } from "./lib/appUpdate";
import { registerServiceWorker } from "./lib/serviceWorker";

// The web fonts load without holding up the first paint (index.html marks
// them media="print"); switch them on here rather than with an inline
// onload="…", which the site's Content-Security-Policy blocks.
document.querySelectorAll<HTMLLinkElement>("link[data-async-css]").forEach((l) => {
  l.media = "all";
});

installErrorReporting();
startAppUpdates();
applySystemBarStyle();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
