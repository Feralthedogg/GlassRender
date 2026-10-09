import { createApp } from "vue";
import QuickStart from "./QuickStart.vue";

const container = document.getElementById("app");
if (!container) throw new Error("The #app element is missing.");
createApp(QuickStart).mount(container);
