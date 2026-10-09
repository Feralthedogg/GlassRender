<!-- A line icon from the shared set, in the current text colour. -->
<script lang="ts">
    import { icon, type IconName } from "../../../examples/shared/icons.js";

    let { name }: { name: IconName } = $props();
</script>

<span class="i">{@html icon(name)}</span>
