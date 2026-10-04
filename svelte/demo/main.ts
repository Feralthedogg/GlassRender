import { mount } from "svelte";
import "../../examples/shared/demo.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app") as HTMLElement });
