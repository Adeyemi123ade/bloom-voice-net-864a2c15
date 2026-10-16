import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applySystemBarStyle } from "./lib/systemBars";

applySystemBarStyle();

createRoot(document.getElementById("root")!).render(<App />);
