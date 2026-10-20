import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySystemBarStyle } from "./lib/systemBars";
import { installErrorReporting } from "./lib/errorReport";
import { startAppUpdates } from "./lib/appUpdate";

installErrorReporting();
startAppUpdates();
applySystemBarStyle();

createRoot(document.getElementById("root")!).render(<App />);
