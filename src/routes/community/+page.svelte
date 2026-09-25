<script lang="ts">
	import { relationLabel, RELATION_META } from '$lib/shared/relations';
	import PageHero from '$lib/components/PageHero.svelte';
	import { relativeTime } from '$lib/shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const totalRelationCount = $derived(
		data.community.relationMix.reduce((total, item) => total + item.count, 0)
	);
	const maxContributorActions = $derived(data.community.topContributors[0]?.actions ?? 1);
	const maxMapConcepts = $derived(data.community.mapHighlights[0]?.conceptCount ?? 1);
	const metrics = $derived([
		{ label: 'People mapping', value: data.community.totals.users, accent: 'var(--memphis-cyan)' },
		{ label: 'Maps made', value: data.community.totals.maps, accent: 'var(--memphis-yellow)' },
		{ label: 'Concepts', value: data.community.totals.concepts, accent: 'var(--memphis-pink)' },
		{ label: 'Relations drawn', value: data.community.totals.relations, accent: 'var(--memphis-purple)' },
		{ label: 'Comments', value: data.community.totals.comments, accent: 'var(--memphis-cyan)' },
		{ label: 'Edits made', value: data.community.totals.actions, accent: 'var(--memphis-pink)' }
	]);

	const FALLBACK = ['#ff3d81', '#00c2d1', '#ffd23f', '#7c3aed', '#10b981', '#f97316'];
	function relationColor(type: string, index: number) {
		return (RELATION_META as Record<string, { color: string }>)[type]?.color ?? FALLBACK[index % FALLBACK.length];
	}

	function initials(name: string | null) {
		return (name ?? '??')
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]!.toUpperCase())
			.join('');
	}
</script>

<svelte:head>
	<title>Community · Concept Cartography</title>
	<meta name="description" content="Explore the people, maps, and connections growing in Concept Cartography." />
</svelte:head>

<div class="flex-1 overflow-hidden">
	<PageHero
		eyebrow="The living atlas"
		title="A community of connected ideas."
		description="See the shared shape of Concept Cartography: the people contributing, the maps taking form, and the relationships tying it all together."
		width="max-w-7xl"
	>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
			{#each metrics as metric, index (metric.label)}
				<div class="cc-stat cc-rise community-stat" style="--delay: {index * 70}ms; --accent: {metric.accent}">
					<div>
						<p class="cc-stat-value !text-3xl">{metric.value}</p>
						<p class="cc-stat-label mt-1">{metric.label}</p>
					</div>
				</div>
			{/each}
		</div>
	</PageHero>

	<div class="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:py-12">
		<section class="cc-card cc-rise p-6" aria-labelledby="contributors-heading">
			<div class="flex items-end justify-between gap-4">
				<div>
					<p class="cc-eyebrow">People power</p>
					<h2 id="contributors-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Leading contributors</h2>
				</div>
				<span class="community-pulse-dot" aria-hidden="true"></span>
			</div>
			{#if data.community.topContributors.length > 0}
				<div class="mt-7 space-y-5">
					{#each data.community.topContributors as contributor, index (contributor.userId)}
						<div class="flex items-center gap-3">
							<span class="cc-avatar" style="--avatar: {contributor.color}">{initials(contributor.name)}</span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-3">
									<p class="truncate text-sm font-bold text-slate-800">
										{#if index === 0}<span class="mr-1 text-amber-500" aria-hidden="true">✦</span>{/if}{contributor.name ?? 'Unknown mapper'}
									</p>
									<span class="shrink-0 text-xs font-semibold text-slate-500">{contributor.actions} edits</span>
								</div>
								<div class="cc-bar mt-2">
									<span style="--w: {(contributor.actions / maxContributorActions) * 100}%; --bar: {contributor.color}; --delay: {index * 80}ms"></span>
								</div>
								<p class="mt-1 text-xs text-slate-400">Active across {contributor.maps} map{contributor.maps === 1 ? '' : 's'}</p>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<p class="cc-muted mt-8 text-sm">The first contributions are waiting to be made.</p>
			{/if}
		</section>

		<section class="cc-card cc-rise p-6" style="--delay: 120ms" aria-labelledby="maps-heading">
			<p class="cc-eyebrow">Shared terrain</p>
			<h2 id="maps-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Maps taking shape</h2>
			<div class="mt-7 space-y-3">
				{#each data.community.mapHighlights as map, index (map.id)}
					<a href="/maps/{map.id}" class="cc-card cc-card-link group block px-4 py-3">
						<div class="flex items-center justify-between gap-3">
							<h3 class="truncate font-bold text-slate-800">{map.name}</h3>
							<span class="cc-chip shrink-0 !text-[11px]"><span class="cc-dot !h-2 !w-2"></span>{map.conceptCount}</span>
						</div>
						<div class="cc-bar mt-2.5 !h-2">
							<span style="--w: {Math.max(8, (map.conceptCount / maxMapConcepts) * 100)}%; --bar: var(--memphis-cyan); --delay: {index * 70}ms"></span>
						</div>
						<p class="mt-2 text-xs text-slate-500">{map.relationCount} links · {map.contributorCount} contributor{map.contributorCount === 1 ? '' : 's'}</p>
					</a>
				{:else}
					<p class="cc-muted text-sm">No maps have been created yet.</p>
				{/each}
			</div>
		</section>

		<section class="cc-card cc-rise p-6" style="--delay: 180ms" aria-labelledby="relations-heading">
			<p class="cc-eyebrow">The vocabulary of connection</p>
			<h2 id="relations-heading" class="cc-display mt-1.5 text-2xl text-slate-900">How ideas relate</h2>
			{#if totalRelationCount > 0}
				<!-- Stacked overview bar, then the per-type breakdown. -->
				<div class="cc-bar mt-7 flex !h-5">
					{#each data.community.relationMix as relation, index (relation.type)}
						<span style="--w: {(relation.count / totalRelationCount) * 100}%; --bar: {relationColor(relation.type, index)}; --delay: {index * 60}ms" title="{relationLabel(relation.type)} · {relation.count}"></span>
					{/each}
				</div>
				<ul class="mt-5 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
					{#each data.community.relationMix as relation, index (relation.type)}
						<li class="flex items-center gap-2 text-sm">
							<span class="cc-dot" style="--dot: {relationColor(relation.type, index)}"></span>
							<span class="flex-1 truncate font-semibold text-slate-700">{relationLabel(relation.type)}</span>
							<span class="text-xs tabular-nums text-slate-500">{relation.count} · {Math.round((relation.count / totalRelationCount) * 100)}%</span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="cc-muted mt-8 text-sm">Relations will appear here as maps grow.</p>
			{/if}
		</section>

		<section class="cc-card cc-rise p-6" style="--delay: 240ms" aria-labelledby="activity-heading">
			<p class="cc-eyebrow">Live pulse</p>
			<h2 id="activity-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Recent movement</h2>
			{#if data.community.recentActivity.length > 0}
				<ol class="community-timeline mt-7">
					{#each data.community.recentActivity as activity (activity.id)}
						<li class="relative pb-5 pl-6 last:pb-0">
							<span class="community-timeline-dot" style="--dot: {activity.userColor ?? 'var(--memphis-yellow)'}" aria-hidden="true"></span>
							<p class="text-sm leading-relaxed text-slate-700">{activity.summary}</p>
							<p class="mt-0.5 text-xs text-slate-400">{activity.userName ?? 'Someone'} · {relativeTime(activity.createdAt)}</p>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="cc-muted mt-8 text-sm">Activity will begin appearing as the community maps together.</p>
			{/if}
		</section>
	</div>
</div>

<style>
	.community-stat {
		position: relative;
		overflow: hidden;
		border-top-width: 6px;
		border-top-color: var(--accent);
	}
	.community-pulse-dot {
		display: block;
		height: 0.75rem;
		width: 0.75rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: #22c55e;
		animation: community-pulse 2s infinite;
	}
	.community-timeline {
		border-left: 2px dashed rgb(20 17 15 / 0.2);
		margin-left: 0.4rem;
	}
	.community-timeline-dot {
		position: absolute;
		left: -0.5rem;
		top: 0.3rem;
		height: 0.85rem;
		width: 0.85rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: var(--dot);
	}
	:global(.dark) .community-timeline {
		border-color: #334155;
	}
	:global(.dark) .community-timeline-dot {
		border-color: #0f172a;
	}
	:global(.dark) .community-stat {
		border-top-color: var(--accent);
	}
</style>
