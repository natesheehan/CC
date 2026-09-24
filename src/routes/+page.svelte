<script lang="ts">
	import { page } from '$app/state';
	import NetworkAnimation from '$lib/components/NetworkAnimation.svelte';
</script>

<svelte:head>
	<title>Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 flex-col">
	<!-- Hero -->
	<section class="relative flex min-h-[calc(100svh-7rem)] overflow-hidden bg-slate-900 sm:min-h-[calc(100svh-4rem)]">
		<div
			class="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(255,61,129,0.22),transparent)]"
		></div>
		<div
			class="memphis-shape memphis-shape-circle pointer-events-none absolute -left-10 top-16 h-40 w-40 sm:h-56 sm:w-56"
			aria-hidden="true"
		></div>
		<div
			class="memphis-shape memphis-shape-triangle pointer-events-none absolute -right-6 bottom-10 h-32 w-32 sm:h-44 sm:w-44"
			aria-hidden="true"
		></div>
		<div class="pointer-events-none absolute inset-0">
			<NetworkAnimation />
		</div>
		<div
			class="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-900"
		></div>
		<div class="relative z-10 mx-auto flex min-h-[calc(100svh-7rem)] max-w-3xl flex-col items-center justify-center px-4 py-16 text-center sm:min-h-[calc(100svh-4rem)] sm:px-6 sm:py-20">
			<p class="memphis-badge">Free & open source</p>
			<h1 class="mt-3 text-4xl font-bold tracking-tight text-white sm:text-6xl">
				Unpack the pleasures and problems of layered meaning..
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
					class="rounded-full border-2 border-memphis-yellow px-5 py-2.5 text-sm font-semibold text-slate-100 transition hover:bg-memphis-yellow hover:text-slate-900"
				>
					Browse the concept directory
				</a>
			</div>
		</div>
	</section>

</div>
