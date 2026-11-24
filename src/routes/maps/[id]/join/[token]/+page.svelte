<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';
</script>

<svelte:head>
	<title>Invite link · Concept Cartography</title>
</svelte:head>

<div class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-20 text-center">
	<div class="cc-card w-full p-8">
		<h1 class="text-xl font-bold text-slate-800">This invite link doesn't work</h1>
		<p class="mt-2 text-sm text-slate-500">
			It may have been turned off or replaced by the map's owner. Ask them for a new link.
		</p>
		<a href="/maps" class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-memphis-pink hover:underline">
			<Icon name="chevronLeft" class="h-4 w-4" /> Back to maps
		</a>
	</div>
</div>
