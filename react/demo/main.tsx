import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../examples/shared/demo.css";
import { App } from "./App.js";

createRoot(document.getElementById("app") as HTMLElement).render(<StrictMode><App /></StrictMode>);
