<script lang="ts">
	import InfoPage from '$lib/components/InfoPage.svelte';
	import { infoPage } from '$lib/content/legal';
</script>

<InfoPage info={infoPage('/about')} />
