<script lang="ts">
	import { page } from '$app/state';

	const steps = [
		{
			title: '1. Create a map',
			body: 'Start a new concept map for a topic — a course, a research area, anything you want to think through. Give it a name and an optional description.'
		},
		{
			title: '2. Add concepts',
			body: 'Each concept is a node on the map: a name, a definition, examples, source links, and an optional quiz question. Drag nodes around to arrange the map however makes sense to you.'
		},
		{
			title: '3. Link concepts with relations',
			body: 'Draw a relation between two concepts and choose what kind it is (type of, part of, produces, counteracts, and more) — built-in or your own custom types. Mark a relation as one-directional (→) or multi-directional (↔), and describe what the link means.'
		},
		{
			title: '4. Discuss relations',
			body: "Click any relation on the map to open its comment thread. Aggregate every relation touching a concept from that concept's panel, grouped by type and fully explorable."
		},
		{
			title: '5. Share and revisit',
			body: 'Every concept and relation gets a shareable URL, so you can link straight to a specific node or link in a conversation. An activity feed tracks who added or edited what, and when.'
		},
		{
			title: '6. Browse the concept directory',
			body: 'The Concepts tab is a searchable dictionary of every concept across every map — useful for finding out whether a concept already exists before you add a duplicate.'
		}
	];
</script>

<svelte:head>
	<title>How it works · Concept Cartography</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
	<h1 class="text-2xl font-semibold text-slate-900">How Concept Cartography works</h1>
	<p class="mt-2 text-sm text-slate-500">
		A concept map is a network of ideas: nodes for concepts, and labeled, directional links for how
		they relate to each other. Here's how to build one.
	</p>

	<ol class="mt-8 space-y-6">
		{#each steps as step (step.title)}
			<li class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
				<h2 class="font-semibold text-slate-800">{step.title}</h2>
				<p class="mt-1.5 text-sm leading-relaxed text-slate-600">{step.body}</p>
			</li>
		{/each}
	</ol>

	<div class="mt-10 flex flex-wrap items-center gap-3">
		<a
			href={page.data.user ? '/maps' : '/login'}
			class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
		>
			{page.data.user ? 'Go to your maps' : 'Sign in to get started'}
		</a>
		<a href="/concepts" class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
			Browse the concept directory
		</a>
	</div>
</div>
