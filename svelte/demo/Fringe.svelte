<!-- A switch for one kind of colour fringes, with its sliders while it is on. -->
<script lang="ts" generics="T extends RimFringes | LensFringes">
    import type { FringeField, LensFringes, RimFringes } from "../../examples/shared/options.js";

    let { title, field, value, fields, onchange }: {
        title: string; field: string; value: T; fields: readonly FringeField<Exclude<keyof T, "on"> & string>[]; onchange: (value: T) => void;
    } = $props();
</script>

<div class="toggle-row">
    <span>{title} <code>{field}</code></span>
    <button class="switch" role="switch" aria-checked={value.on} aria-label={title} onclick={() => onchange({ ...value, on: !value.on })}></button>
</div>
{#if value.on}
    <div class="sub">
        {#each fields as f (f.key)}
            {@const v = value[f.key] as number}
            <div class="field" title={f.hint}>
                <span class="label">{f.label}</span>
                <div class="range">
                    <input type="range" min={f.min} max={f.max} step={f.step} value={v} aria-label="{title} {f.label}"
                        style="--p: {((v - f.min) / (f.max - f.min)) * 100}%" oninput={(e) => onchange({ ...value, [f.key]: Number(e.currentTarget.value) })} />
                    <output>{v}{f.unit}</output>
                </div>
            </div>
        {/each}
    </div>
{/if}
