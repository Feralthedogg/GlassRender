<script lang="ts">
    import { Glass, GlassCanvas } from "glassrender-svelte";
    import type { Preset } from "glassrender/materials";

    let preset: Preset = $state("standard");
    const next = $derived(preset === "standard" ? "clear" : "standard");

</script>

<GlassCanvas>
    <main style="min-height: 100vh; padding: 24px; box-sizing: border-box; display: grid; place-items: center;">
        <Glass {preset} radius={24} style="width: 320px; max-width: 100%; padding: 32px; box-sizing: border-box; color: var(--glass-foreground);">
            <h1>GlassRender</h1>
            <p>Material: <strong data-preset>{preset}</strong>.</p>
            <Glass preset="control" radius={24} interactive>
                <button type="button" onclick={() => (preset = next)}
                    style="width: 100%; min-height: 48px; padding: 12px 16px; border: 0; background: transparent; color: var(--glass-title); font: inherit; cursor: pointer;">
                    Switch to {next}
                </button>
            </Glass>
        </Glass>
    </main>
</GlassCanvas>
