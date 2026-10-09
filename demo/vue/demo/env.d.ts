declare module "*.vue" {
    import type { DefineComponent } from "vue";
    const component: DefineComponent<object, object, unknown>;
    export default component;
}

// Stylesheets are imported for their side effect; Vite adds them to the page.
declare module "*.css";
