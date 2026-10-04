<script lang="ts">
    import { Glass, GlassCanvas } from "glassrender-svelte";

    const backdrop = "data:image/svg+xml," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">' +
        '<rect width="1200" height="800" fill="#163350"/>' +
        '<circle cx="350" cy="300" r="260" fill="#7960e8"/>' +
        '<path d="M0 600L1200 200V800H0Z" fill="#e58c53"/>' +
        '<path d="M0 0L1200 800M0 200L900 800" stroke="white" stroke-width="24"/>' +
        '</svg>'
    );
</script>

<GlassCanvas {backdrop}>
    <main style="min-height: 100vh; display: grid; place-items: center;">
        <Glass preset="standard" radius={24} style="width: 320px; padding: 32px;">
            <h1>GlassRender</h1>
            <p>Svelte local package example.</p>
        </Glass>
    </main>
</GlassCanvas>
