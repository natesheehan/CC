<script lang="ts">
	import { page } from '$app/state';
	import NetworkAnimation from '$lib/components/NetworkAnimation.svelte';
</script>

<svelte:head>
	<title>Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col">
	<!-- Hero -->
	<section class="relative overflow-hidden bg-slate-900">
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(59,130,246,0.16),transparent)]"
		></div>
		<div class="pointer-events-none absolute inset-0">
			<NetworkAnimation />
		</div>
		<div
			class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900"
		></div>
		<div class="relative z-10 mx-auto max-w-3xl px-4 py-28 text-center sm:px-6 sm:py-36">
			<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">Concept Cartography</p>
			<h1 class="mt-3 text-4xl font-bold tracking-tight text-white sm:text-6xl">
				Connecting Concepts Cartographically.
			</h1>
			<p class="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-slate-300">
				Collaborative concept maps for teams and classrooms.
			</p>
			<div class="mt-9 flex flex-wrap items-center justify-center gap-3">
				<a
					href={page.data.user ? '/maps' : '/login'}
					class="rounded-md bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-400"
				>
					{page.data.user ? 'Go to your maps' : 'Sign in to get started'}
				</a>
				<a
					href="/concepts"
					class="rounded-md border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
				>
					Browse the concept directory
				</a>
			</div>
		</div>
	</section>

</div>
