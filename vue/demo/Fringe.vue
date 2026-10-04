<!-- A switch for one kind of colour fringes, with its sliders while it is on. -->
<script setup lang="ts" generic="T extends RimFringes | LensFringes">
import type { FringeField, LensFringes, RimFringes } from "../../examples/shared/options.js";

const props = defineProps<{ title: string; field: string; value: T; fields: readonly FringeField<Exclude<keyof T, "on"> & string>[] }>();
const emit = defineEmits<{ change: [value: T] }>();

const read = (key: Exclude<keyof T, "on"> & string): number => props.value[key] as number;
function write(key: Exclude<keyof T, "on"> & string, e: Event): void {
    emit("change", { ...props.value, [key]: Number((e.target as HTMLInputElement).value) });
}
</script>

<template>
    <div class="toggle-row">
        <span>{{ title }} <code>{{ field }}</code></span>
        <button class="switch" role="switch" :aria-checked="value.on" :aria-label="title" @click="emit('change', { ...value, on: !value.on })" />
    </div>
    <div v-if="value.on" class="sub">
        <div v-for="f in fields" :key="f.key" class="field" :title="f.hint">
            <span class="label">{{ f.label }}</span>
            <div class="range">
                <input type="range" :min="f.min" :max="f.max" :step="f.step" :value="read(f.key)" :aria-label="title + ' ' + f.label"
                    :style="{ '--p': ((read(f.key) - f.min) / (f.max - f.min)) * 100 + '%' }" @input="write(f.key, $event)">
                <output>{{ read(f.key) }}{{ f.unit }}</output>
            </div>
        </div>
    </div>
</template>
