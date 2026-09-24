<script lang="ts">
	import { relationLabel } from '$lib/shared/relations';
	import { relativeTime } from '$lib/shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const totalRelationCount = $derived(
		data.community.relationMix.reduce((total, item) => total + item.count, 0)
	);
	const maxContributorActions = $derived(data.community.topContributors[0]?.actions ?? 1);
	const maxMapConcepts = $derived(data.community.mapHighlights[0]?.conceptCount ?? 1);
	const metrics = $derived([
		{ label: 'People mapping', value: data.community.totals.users, accent: 'cyan' },
		{ label: 'Maps made', value: data.community.totals.maps, accent: 'blue' },
		{ label: 'Concepts connected', value: data.community.totals.concepts, accent: 'violet' },
		{ label: 'Relations drawn', value: data.community.totals.relations, accent: 'cyan' },
		{ label: 'Comments shared', value: data.community.totals.comments, accent: 'amber' },
		{ label: 'Ideas in motion', value: data.community.totals.actions, accent: 'amber' }
	]);
</script>

<svelte:head>
	<title>Community · Concept Cartography</title>
	<meta name="description" content="Explore the people, maps, and connections growing in Concept Cartography." />
</svelte:head>

<div class="community-page flex-1 overflow-hidden">
	<section class="community-hero relative overflow-hidden border-b border-slate-200 bg-white">
		<div class="community-grid absolute inset-0" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-one absolute" aria-hidden="true"></div>
		<div class="community-orbit community-orbit-two absolute" aria-hidden="true"></div>
		<div class="relative mx-auto max-w-7xl px-4 pb-16 pt-14 sm:px-6 lg:pb-20 lg:pt-20">
			<div class="max-w-2xl community-reveal">
				<p class="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">The living atlas</p>
				<h1 class="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-6xl">
					A community of connected ideas.
				</h1>
				<p class="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
					See the shared shape of Concept Cartography: the people contributing, the maps taking form,
					and the relationships tying it all together.
				</p>
			</div>

			<div class="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
				{#each metrics as metric, index (metric.label)}
					<div class="community-metric community-reveal" style={`--delay: ${index * 90}ms`}>
						<div class="community-metric-glow {metric.accent}"></div>
						<p class="relative text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{metric.value}</p>
						<p class="relative mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">{metric.label}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<main class="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-14">
		<section class="community-panel community-reveal" aria-labelledby="contributors-heading">
			<div class="flex items-end justify-between gap-4">
				<div>
					<p class="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">People power</p>
					<h2 id="contributors-heading" class="mt-2 text-2xl font-semibold text-slate-900">Leading contributors</h2>
				</div>
				<span class="community-pulse-dot" aria-hidden="true"></span>
			</div>
			{#if data.community.topContributors.length > 0}
				<div class="mt-8 space-y-5">
					{#each data.community.topContributors as contributor, index (contributor.userId)}
						<div class="community-bar-row" style={`--delay: ${index * 80}ms`}>
							<div class="flex items-center gap-3">
								<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={`background-color: ${contributor.color}`}>
									{(contributor.name ?? '??').slice(0, 2).toUpperCase()}
								</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-center justify-between gap-3">
										<p class="truncate text-sm font-semibold text-slate-800">{contributor.name ?? 'Unknown mapper'}</p>
										<span class="shrink-0 text-xs text-slate-500">{contributor.actions} edits</span>
									</div>
									<div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
										<div class="community-bar-fill" style={`--width: ${(contributor.actions / maxContributorActions) * 100}%; --color: ${contributor.color}`}></div>
									</div>
									<p class="mt-1 text-xs text-slate-400">Active across {contributor.maps} map{contributor.maps === 1 ? '' : 's'}</p>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-8 text-sm text-slate-500">The first contributions are waiting to be made.</p>
			{/if}
		</section>

		<section class="community-panel community-reveal" style="--delay: 120ms" aria-labelledby="maps-heading">
			<p class="text-xs font-semibold uppercase tracking-[0.16em] text-violet-600">Shared terrain</p>
			<h2 id="maps-heading" class="mt-2 text-2xl font-semibold text-slate-900">Maps taking shape</h2>
			<div class="mt-8 space-y-5">
				{#each data.community.mapHighlights as map, index (map.id)}
					<a href="/maps/{map.id}" class="community-map-row group" style={`--delay: ${index * 70}ms`}>
						<div class="flex items-center justify-between gap-3">
							<h3 class="truncate font-semibold text-slate-800 group-hover:text-blue-600">{map.name}</h3>
							<span class="text-xs text-slate-400">{map.conceptCount} concepts</span>
						</div>
						<div class="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
							<div class="community-map-fill" style={`--width: ${Math.max(8, (map.conceptCount / maxMapConcepts) * 100)}%`}></div>
						</div>
						<p class="mt-2 text-xs text-slate-500">{map.relationCount} links · {map.contributorCount} contributor{map.contributorCount === 1 ? '' : 's'}</p>
					</a>
				{:else}
					<p class="text-sm text-slate-500">No maps have been created yet.</p>
				{/each}
			</div>
		</section>

		<section class="community-panel community-reveal" style="--delay: 180ms" aria-labelledby="relations-heading">
			<p class="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-600">The vocabulary of connection</p>
			<h2 id="relations-heading" class="mt-2 text-2xl font-semibold text-slate-900">How ideas relate</h2>
			{#if totalRelationCount > 0}
				<div class="mt-8 space-y-4">
					{#each data.community.relationMix as relation, index (relation.type)}
						<div class="community-relation-row" style={`--delay: ${index * 70}ms`}>
							<div class="flex items-center justify-between text-sm">
								<span class="font-medium text-slate-700">{relationLabel(relation.type)}</span>
								<span class="text-xs text-slate-500">{relation.count}</span>
							</div>
							<div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
								<div class="community-relation-fill" style={`--width: ${(relation.count / totalRelationCount) * 100}%; --hue: ${index * 38 + 190}`}></div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-8 text-sm text-slate-500">Relations will appear here as maps grow.</p>
			{/if}
		</section>

		<section class="community-panel community-reveal" style="--delay: 240ms" aria-labelledby="activity-heading">
			<p class="text-xs font-semibold uppercase tracking-[0.16em] text-amber-600">Live pulse</p>
			<h2 id="activity-heading" class="mt-2 text-2xl font-semibold text-slate-900">Recent movement</h2>
			{#if data.community.recentActivity.length > 0}
				<div class="mt-8 space-y-0">
					{#each data.community.recentActivity as activity (activity.id)}
						<div class="community-activity-row flex gap-3 border-l border-slate-200 pb-5 pl-4 last:pb-0">
							<span class="community-activity-dot" aria-hidden="true"></span>
							<div class="min-w-0">
								<p class="text-sm leading-relaxed text-slate-700">{activity.summary}</p>
								<p class="mt-1 text-xs text-slate-400">{activity.userName ?? 'Someone'} · {relativeTime(activity.createdAt)}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="mt-8 text-sm text-slate-500">Activity will begin appearing as the community maps together.</p>
			{/if}
		</section>
	</main>
</div>