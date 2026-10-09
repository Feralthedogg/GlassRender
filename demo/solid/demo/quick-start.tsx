import { render } from "solid-js/web";
import QuickStart from "./QuickStart.js";

const target = document.getElementById("app");
if (!target) throw new Error("The #app element is missing.");
render(() => <QuickStart />, target);
