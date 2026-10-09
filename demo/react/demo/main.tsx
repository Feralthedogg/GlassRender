import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../../examples/shared/demo.css";
import { App } from "./App.js";

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createRoot(container).render(<StrictMode><App /></StrictMode>);
