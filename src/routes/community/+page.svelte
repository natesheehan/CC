<script lang="ts">
	import { relationLabel, RELATION_META } from '$lib/shared/relations';
	import PageHero from '$lib/components/PageHero.svelte';
	import { relativeTime } from '$lib/shared/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const totals = $derived(data.community.totals);
	const fmt = (n: number) => n.toLocaleString();
	const ratio = (a: number, b: number) => (b === 0 ? '0' : (a / b).toFixed(1));

	const totalRelationCount = $derived(
		data.community.relationMix.reduce((total, item) => total + item.count, 0)
	);
	const maxRelationCount = $derived(data.community.relationMix[0]?.count ?? 1);
	const maxContributorActions = $derived(data.community.topContributors[0]?.actions ?? 1);
	const maxMapConcepts = $derived(Math.max(1, ...data.community.mapHighlights.map((m) => m.conceptCount)));

	// --- 30-day pulse ---------------------------------------------------------
	const days = $derived(data.community.activityByDay);
	const monthTotal = $derived(days.reduce((sum, d) => sum + d.count, 0));
	const activeDays = $derived(days.filter((d) => d.count > 0).length);
	const peakDay = $derived(days.reduce((best, d) => (d.count > best.count ? d : best), days[0] ?? { date: '', count: 0 }));
	const maxDay = $derived(Math.max(1, peakDay.count));
	let hoveredDay = $state<number | null>(null);
	const readout = $derived(hoveredDay == null ? null : days[hoveredDay]);

	function dayLabel(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) {
		return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { ...opts, timeZone: 'UTC' });
	}

	const metrics = $derived([
		{ label: 'People mapping', value: totals.users, note: null, accent: 'var(--memphis-cyan)' },
		{ label: 'Maps made', value: totals.maps, note: `${ratio(totals.concepts, totals.maps)} concepts each`, accent: 'var(--memphis-yellow)' },
		{ label: 'Concepts', value: totals.concepts, note: null, accent: 'var(--memphis-pink)' },
		{ label: 'Relations drawn', value: totals.relations, note: `${ratio(totals.relations, totals.concepts)} per concept`, accent: 'var(--memphis-purple)' },
		{ label: 'Comments', value: totals.comments, note: 'on relations', accent: 'var(--memphis-cyan)' },
		{ label: 'Edits made', value: totals.actions, note: `${fmt(monthTotal)} this month`, accent: 'var(--memphis-pink)' }
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
		<dl class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-6">
			{#each metrics as metric, index (metric.label)}
				<div class="community-stat cc-rise" style="--delay: {index * 60}ms; --accent: {metric.accent}">
					<dt class="cc-stat-label">{metric.label}</dt>
					<dd class="cc-display mt-1.5 text-[1.75rem] leading-none tabular-nums text-slate-900 sm:text-3xl">{fmt(metric.value)}</dd>
					{#if metric.note}
						<dd class="mt-1.5 truncate text-[11px] font-semibold text-slate-500">{metric.note}</dd>
					{/if}
				</div>
			{/each}
		</dl>
	</PageHero>

	<div class="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:py-12">
		<!-- 30-day pulse: one series, so one hue and no legend. -->
		<section class="cc-card cc-rise p-5 sm:p-6" aria-labelledby="pulse-heading">
			<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
				<div>
					<p class="cc-eyebrow">Last 30 days</p>
					<h2 id="pulse-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Community pulse</h2>
				</div>
				<dl class="flex gap-5 text-sm sm:gap-8">
					<div>
						<dt class="cc-stat-label">Edits</dt>
						<dd class="cc-display mt-1 text-xl tabular-nums text-slate-900">{fmt(monthTotal)}</dd>
					</div>
					<div>
						<dt class="cc-stat-label">Active days</dt>
						<dd class="cc-display mt-1 text-xl tabular-nums text-slate-900">{activeDays}<span class="text-sm text-slate-400">/30</span></dd>
					</div>
					<div>
						<dt class="cc-stat-label">Busiest</dt>
						<dd class="cc-display mt-1 text-xl tabular-nums text-slate-900">{peakDay.count > 0 ? dayLabel(peakDay.date) : '—'}</dd>
					</div>
				</dl>
			</div>

			<p class="mt-5 h-5 text-sm text-slate-600" aria-live="polite">
				{#if readout}
					<span class="font-bold text-slate-900">{dayLabel(readout.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
					· {readout.count} edit{readout.count === 1 ? '' : 's'}
				{:else}
					<span class="text-slate-400">Hover or tap a day for details</span>
				{/if}
			</p>

			<div class="relative">
				{#if monthTotal === 0}
					<p class="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-400">No edits in the last 30 days</p>
				{/if}
				<div class="pulse-chart mt-2" role="img" aria-label="Edits per day over the last 30 days, peaking at {peakDay.count}">
					{#each days as day, i (day.date)}
						<button
							type="button"
							class="pulse-col"
							class:active={hoveredDay === i}
							aria-label="{dayLabel(day.date)}: {day.count} edits"
							onpointerenter={() => (hoveredDay = i)}
							onpointerleave={() => (hoveredDay = null)}
							onfocus={() => (hoveredDay = i)}
							onblur={() => (hoveredDay = null)}
							onclick={() => (hoveredDay = i)}
						>
							<span class="pulse-bar" class:empty={day.count === 0} style="--h: {(day.count / maxDay) * 100}%"></span>
						</button>
					{/each}
				</div>
			</div>
			<div class="pulse-axis mt-2 flex justify-between text-[11px] font-semibold text-slate-400">
				<span>{days[0] ? dayLabel(days[0].date) : ''}</span>
				<span class="hidden sm:inline">{days[15] ? dayLabel(days[15].date) : ''}</span>
				<span>Today</span>
			</div>

			<table class="sr-only">
				<caption>Edits per day, last 30 days</caption>
				<thead><tr><th>Date</th><th>Edits</th></tr></thead>
				<tbody>
					{#each days as day (day.date)}
						<tr><td>{day.date}</td><td>{day.count}</td></tr>
					{/each}
				</tbody>
			</table>
		</section>

		<div class="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
			<section class="cc-card cc-rise p-5 sm:p-6" aria-labelledby="contributors-heading">
				<div class="flex items-end justify-between gap-4">
					<div>
						<p class="cc-eyebrow">People power</p>
						<h2 id="contributors-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Leading contributors</h2>
					</div>
					<span class="community-pulse-dot" aria-hidden="true"></span>
				</div>
				{#if data.community.topContributors.length > 0}
					<ol class="mt-6 space-y-4">
						{#each data.community.topContributors as contributor, index (contributor.userId)}
							<li class="flex items-center gap-3">
								<span class="w-5 shrink-0 text-right text-xs font-black tabular-nums text-slate-400">{index + 1}</span>
								<span class="cc-avatar shrink-0" style="--avatar: {contributor.color}">{initials(contributor.name)}</span>
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline justify-between gap-3">
										<p class="truncate text-sm font-bold text-slate-800">{contributor.name ?? 'Unknown mapper'}</p>
										<span class="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{fmt(contributor.actions)} edits</span>
									</div>
									<div class="community-track mt-1.5">
										<span style="--w: {(contributor.actions / maxContributorActions) * 100}%; --bar: {contributor.color}; --delay: {index * 80}ms"></span>
									</div>
									<p class="mt-1 text-xs text-slate-400">
										{Math.round((contributor.actions / Math.max(1, totals.actions)) * 100)}% of all edits · {contributor.maps} map{contributor.maps === 1 ? '' : 's'}
									</p>
								</div>
							</li>
						{/each}
					</ol>
				{:else}
					<p class="cc-muted mt-8 text-sm">The first contributions are waiting to be made.</p>
				{/if}
			</section>

			<section class="cc-card cc-rise p-5 sm:p-6" style="--delay: 120ms" aria-labelledby="maps-heading">
				<p class="cc-eyebrow">Shared terrain</p>
				<h2 id="maps-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Maps taking shape</h2>
				<div class="mt-6 space-y-3">
					{#each data.community.mapHighlights as map, index (map.id)}
						<a href="/maps/{map.id}" class="cc-card cc-card-link group block px-4 py-3">
							<div class="flex items-baseline justify-between gap-3">
								<h3 class="truncate font-bold text-slate-800">{map.name}</h3>
								<span class="shrink-0 text-xs font-semibold tabular-nums text-slate-500">{map.conceptCount} concepts</span>
							</div>
							<div class="community-track mt-2">
								<span style="--w: {Math.max(4, (map.conceptCount / maxMapConcepts) * 100)}%; --bar: var(--memphis-cyan); --delay: {index * 70}ms"></span>
							</div>
							<p class="mt-2 text-xs text-slate-500">{map.relationCount} links · {map.contributorCount} contributor{map.contributorCount === 1 ? '' : 's'}</p>
						</a>
					{:else}
						<p class="cc-muted text-sm">No maps have been created yet.</p>
					{/each}
				</div>
			</section>

			<section class="cc-card cc-rise p-5 sm:p-6" style="--delay: 180ms" aria-labelledby="relations-heading">
				<p class="cc-eyebrow">The vocabulary of connection</p>
				<h2 id="relations-heading" class="cc-display mt-1.5 text-2xl text-slate-900">How ideas relate</h2>
				{#if totalRelationCount > 0}
					<!-- Share of the whole, then a ranked breakdown that's readable at any width. -->
					<div class="relation-stack mt-6" aria-hidden="true">
						{#each data.community.relationMix as relation, index (relation.type)}
							<span style="flex-grow: {relation.count}; --bar: {relationColor(relation.type, index)}" title="{relationLabel(relation.type)} · {relation.count}"></span>
						{/each}
					</div>
					<ul class="mt-5 space-y-3">
						{#each data.community.relationMix as relation, index (relation.type)}
							<li>
								<div class="flex items-baseline justify-between gap-3 text-sm">
									<span class="flex min-w-0 items-center gap-2">
										<span class="cc-dot" style="--dot: {relationColor(relation.type, index)}"></span>
										<span class="truncate font-semibold text-slate-700">{relationLabel(relation.type)}</span>
									</span>
									<span class="shrink-0 text-xs tabular-nums text-slate-500">
										<span class="font-bold text-slate-700">{relation.count}</span> · {Math.round((relation.count / totalRelationCount) * 100)}%
									</span>
								</div>
								<div class="community-track thin mt-1.5">
									<span style="--w: {(relation.count / maxRelationCount) * 100}%; --bar: {relationColor(relation.type, index)}; --delay: {index * 60}ms"></span>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="cc-muted mt-8 text-sm">Relations will appear here as maps grow.</p>
				{/if}
			</section>

			<section class="cc-card cc-rise p-5 sm:p-6" style="--delay: 240ms" aria-labelledby="activity-heading">
				<p class="cc-eyebrow">Live pulse</p>
				<h2 id="activity-heading" class="cc-display mt-1.5 text-2xl text-slate-900">Recent movement</h2>
				{#if data.community.recentActivity.length > 0}
					<ol class="community-timeline mt-6">
						{#each data.community.recentActivity as activity (activity.id)}
							<li class="relative pb-5 pl-6 last:pb-0">
								<span class="community-timeline-dot" style="--dot: {activity.userColor ?? 'var(--memphis-yellow)'}" aria-hidden="true"></span>
								<p class="break-words text-sm leading-relaxed text-slate-700">{activity.summary}</p>
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
</div>

<style>
	.community-stat {
		min-width: 0;
		border: 2px solid var(--memphis-ink);
		border-top: 6px solid var(--accent);
		border-radius: 0.8rem;
		background: white;
		padding: 0.75rem 0.9rem 0.8rem;
	}
	:global(.dark) .community-stat {
		border-color: #475569;
		border-top-color: var(--accent);
		background: #172033;
	}

	/* Thin horizontal bars on a quiet track; rounded data end. */
	.community-track {
		height: 0.5rem;
		overflow: hidden;
		border-radius: 9999px;
		background: rgb(20 17 15 / 0.07);
	}
	.community-track.thin {
		height: 0.375rem;
	}
	.community-track > span {
		display: block;
		height: 100%;
		width: var(--w);
		border-radius: 9999px;
		background: var(--bar);
		transform-origin: left;
		animation: community-grow 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: calc(var(--delay, 0ms) + 120ms);
	}
	:global(.dark) .community-track {
		background: rgb(255 255 255 / 0.08);
	}

	/* Part-to-whole strip with a 2px surface gap between segments. */
	.relation-stack {
		display: flex;
		gap: 2px;
		height: 1rem;
		overflow: hidden;
		border-radius: 0.4rem;
	}
	.relation-stack > span {
		flex-basis: 0;
		min-width: 3px;
		background: var(--bar);
	}

	@media (min-width: 640px) {
		.pulse-chart {
			height: 9rem;
		}
	}
	.pulse-chart {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 7rem;
		border-bottom: 1.5px solid rgb(20 17 15 / 0.25);
	}
	.pulse-col {
		display: flex;
		height: 100%;
		flex: 1;
		align-items: flex-end;
		min-width: 0;
		border-radius: 4px 4px 0 0;
		cursor: default;
	}
	.pulse-col:hover,
	.pulse-col.active {
		background: rgb(20 17 15 / 0.05);
	}
	.pulse-col:focus-visible {
		outline: 2px solid var(--memphis-ink);
		outline-offset: 1px;
	}
	.pulse-bar {
		display: block;
		width: 100%;
		height: max(var(--h), 4px);
		border-radius: 4px 4px 0 0;
		background: var(--memphis-pink);
		transform-origin: bottom;
		animation: pulse-rise 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
	}
	.pulse-bar.empty {
		height: 2px;
		background: rgb(20 17 15 / 0.15);
	}
	.pulse-col.active .pulse-bar:not(.empty) {
		background: var(--memphis-pink-deep);
	}
	:global(.dark) .pulse-chart {
		border-color: #475569;
	}
	:global(.dark) .pulse-col:hover,
	:global(.dark) .pulse-col.active {
		background: rgb(255 255 255 / 0.06);
	}
	:global(.dark) .pulse-bar.empty {
		background: #334155;
	}
	:global(.dark) .pulse-col.active .pulse-bar:not(.empty) {
		background: #ff8fb8;
	}
	@keyframes pulse-rise {
		from {
			transform: scaleY(0);
		}
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
	@media (prefers-reduced-motion: reduce) {
		.pulse-bar,
		.community-track > span {
			animation: none;
		}
	}
</style>
