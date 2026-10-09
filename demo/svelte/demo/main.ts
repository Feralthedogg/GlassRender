import { mount } from "svelte";
import "../../../examples/shared/demo.css";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("The #app element is missing.");
mount(App, { target });
