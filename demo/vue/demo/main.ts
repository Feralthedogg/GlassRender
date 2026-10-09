import { createApp } from "vue";
import "../../../examples/shared/demo.css";
import App from "./App.vue";

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createApp(App).mount(container);
