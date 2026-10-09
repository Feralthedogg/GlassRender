import { render } from "solid-js/web";
import App from "./App.js";

const target = document.getElementById("app");
if (!target) throw new Error("The #app element is missing.");
render(() => <App />, target);
