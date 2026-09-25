<script lang="ts">
	import { relativeTime } from '$lib/shared/format';
	import type { ClientActivityEntry, ClientConcept, ClientRelation } from '$lib/shared/types';

	let {
		concepts,
		relations,
		activity,
		onSelectConcept
	}: {
		concepts: ClientConcept[];
		relations: ClientRelation[];
		activity: ClientActivityEntry[];
		onSelectConcept: (id: string) => void;
	} = $props();

	const SPARK_DAYS = 14;
	const FALLBACK_COLORS = ['#ff3d81', '#00c2d1', '#7c3aed', '#f59e0b', '#10b981'];

	// Everyone who has added a concept or link, or shows up in the activity
	// log — ranked by how much they've contributed.
	const contributors = $derived.by(() => {
		const people = new Map<string, { id: string; name: string; color: string | null; count: number }>();
		const bump = (id: string | null | undefined, name: string | null | undefined, color: string | null | undefined) => {
			if (!id) return;
			const p = people.get(id) ?? { id, name: name ?? 'Someone', color: null, count: 0 };
			p.count++;
			if (name) p.name = name;
			if (color) p.color = color;
			people.set(id, p);
		};
		for (const c of concepts) bump(c.createdById, c.createdByName, c.createdByColor);
		for (const r of relations) bump(r.createdById, r.createdByName, null);
		for (const a of activity) {
			const p = people.get(a.userId);
			if (p) {
				if (a.userColor) p.color = a.userColor;
			} else bump(a.userId, a.userName, a.userColor);
		}
		return [...people.values()]
			.sort((a, b) => b.count - a.count)
			.map((p, i) => ({ ...p, color: p.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }));
	});

	const discussions = $derived(relations.reduce((sum, r) => sum + (r.commentCount ?? 0), 0));
	const defined = $derived(
		concepts.length === 0 ? 0 : Math.round((concepts.filter((c) => c.definition?.trim()).length / concepts.length) * 100)
	);

	// Most-connected concept: the "hub" of the map.
	const hub = $derived.by(() => {
		const degree = new Map<string, number>();
		for (const r of relations) {
			degree.set(r.sourceId, (degree.get(r.sourceId) ?? 0) + 1);
			degree.set(r.targetId, (degree.get(r.targetId) ?? 0) + 1);
		}
		let best: { concept: ClientConcept; links: number } | null = null;
		for (const c of concepts) {
			const links = degree.get(c.id) ?? 0;
			if (links > 0 && (!best || links > best.links)) best = { concept: c, links };
		}
		return best;
	});

	// Edits per day over the last two weeks, oldest first.
	const spark = $derived.by(() => {
		const buckets = new Array(SPARK_DAYS).fill(0);
		const dayMs = 86_400_000;
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const start = today.getTime() - (SPARK_DAYS - 1) * dayMs;
		for (const a of activity) {
			const i = Math.floor((new Date(a.createdAt).getTime() - start) / dayMs);
			if (i >= 0 && i < SPARK_DAYS) buckets[i]++;
		}
		return buckets as number[];
	});
	const sparkMax = $derived(Math.max(1, ...spark));
	const lastEdit = $derived(activity[0] ?? null);

	function initials(name: string) {
		return name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]!.toUpperCase())
			.join('');
	}
</script>

<div class="map-stats flex items-stretch gap-2 overflow-x-auto pb-0.5 sm:gap-3" aria-label="Community stats">
	<!-- Contributors -->
	<div class="map-stat">
		<div class="flex -space-x-2">
			{#each contributors.slice(0, 4) as p (p.id)}
				<span
					class="map-avatar"
					style="--avatar: {p.color}"
					title="{p.name} · {p.count} contribution{p.count === 1 ? '' : 's'}">{initials(p.name)}</span
				>
			{/each}
			{#if contributors.length > 4}
				<span class="map-avatar map-avatar-more">+{contributors.length - 4}</span>
			{/if}
		</div>
		<div>
			<p class="map-stat-value">{contributors.length}</p>
			<p class="map-stat-label">contributor{contributors.length === 1 ? '' : 's'}</p>
		</div>
	</div>

	<div class="map-stat">
		<div>
			<p class="map-stat-value"><span class="map-stat-dot bg-memphis-pink"></span>{concepts.length}</p>
			<p class="map-stat-label">concepts</p>
		</div>
		<div>
			<p class="map-stat-value"><span class="map-stat-dot bg-memphis-cyan"></span>{relations.length}</p>
			<p class="map-stat-label">links</p>
		</div>
		<div>
			<p class="map-stat-value"><span class="map-stat-dot bg-memphis-yellow"></span>{discussions}</p>
			<p class="map-stat-label">comments</p>
		</div>
	</div>

	<!-- Definition coverage ring -->
	{#if concepts.length > 0}
		<div class="map-stat" title="{defined}% of concepts have a definition">
			<svg viewBox="0 0 36 36" class="h-9 w-9 shrink-0 -rotate-90" aria-hidden="true">
				<circle cx="18" cy="18" r="14" class="map-ring-track" />
				<circle
					cx="18"
					cy="18"
					r="14"
					class="map-ring-fill"
					stroke-dasharray="{(defined / 100) * 88} 88"
				/>
			</svg>
			<div>
				<p class="map-stat-value">{defined}%</p>
				<p class="map-stat-label">defined</p>
			</div>
		</div>
	{/if}

	{#if hub}
		<button type="button" class="map-stat map-stat-button" onclick={() => onSelectConcept(hub.concept.id)} title="Most-connected concept">
			<span class="map-hub-icon" aria-hidden="true">✦</span>
			<div class="min-w-0 text-left">
				<p class="max-w-[9rem] truncate text-sm font-bold text-slate-800">{hub.concept.name}</p>
				<p class="map-stat-label">hub · {hub.links} link{hub.links === 1 ? '' : 's'}</p>
			</div>
		</button>
	{/if}

	<!-- Two-week activity sparkline -->
	<div class="map-stat" title="Edits per day, last {SPARK_DAYS} days">
		<svg viewBox="0 0 {SPARK_DAYS * 6} 24" class="h-7 w-[84px] shrink-0" aria-hidden="true">
			{#each spark as n, i}
				{@const h = n === 0 ? 2 : 4 + (n / sparkMax) * 20}
				<rect x={i * 6} y={24 - h} width="4" height={h} rx="1" class={n === 0 ? 'map-spark-empty' : 'map-spark-bar'} />
			{/each}
		</svg>
		<div>
			<p class="text-sm font-bold text-slate-800">{lastEdit ? relativeTime(lastEdit.createdAt) : 'No edits yet'}</p>
			<p class="map-stat-label max-w-[8rem] truncate">{lastEdit ? `last edit · ${lastEdit.userName ?? 'someone'}` : 'activity'}</p>
		</div>
	</div>
</div>

<style>
	.map-stats {
		scrollbar-width: none;
	}
	.map-stat {
		display: flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.85rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.75rem;
		background: white;
		padding: 0.4rem 0.8rem;
	}
	.map-stat-button {
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}
	.map-stat-button:hover {
		transform: translate(-1px, -1px);
		box-shadow: 3px 3px 0 var(--memphis-pink);
	}
	.map-stat-value {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-family: 'Archivo Black', Inter, ui-sans-serif, sans-serif;
		font-size: 1rem;
		line-height: 1.1;
		color: var(--memphis-ink);
	}
	.map-stat-label {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #64748b;
	}
	.map-stat-dot {
		display: inline-block;
		height: 0.5rem;
		width: 0.5rem;
		border-radius: 9999px;
		border: 1.5px solid var(--memphis-ink);
	}
	.map-avatar {
		display: flex;
		height: 1.9rem;
		width: 1.9rem;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: var(--avatar);
		font-size: 0.65rem;
		font-weight: 800;
		color: white;
		text-shadow: 0 1px 1px rgb(0 0 0 / 0.35);
	}
	.map-avatar-more {
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		text-shadow: none;
	}
	.map-hub-icon {
		display: flex;
		height: 1.9rem;
		width: 1.9rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: #fff7e0;
		color: #f59e0b;
	}
	.map-ring-track {
		fill: none;
		stroke: #e2e8f0;
		stroke-width: 5;
	}
	.map-ring-fill {
		fill: none;
		stroke: var(--memphis-cyan);
		stroke-width: 5;
		stroke-linecap: round;
		transition: stroke-dasharray 600ms ease;
	}
	.map-spark-bar {
		fill: var(--memphis-pink);
	}
	.map-spark-empty {
		fill: #e2e8f0;
	}

	:global(.dark) .map-stat {
		border-color: #475569;
		background: #172033;
	}
	:global(.dark) .map-stat-value {
		color: #f8fafc;
	}
	:global(.dark) .map-stat-label {
		color: #94a3b8;
	}
	:global(.dark) .map-stat-dot,
	:global(.dark) .map-avatar,
	:global(.dark) .map-hub-icon {
		border-color: #0f172a;
	}
	:global(.dark) .map-hub-icon {
		background: #3b2a12;
		color: #fbbf24;
	}
	:global(.dark) .map-ring-track,
	:global(.dark) .map-spark-empty {
		stroke: #334155;
		fill: #334155;
	}
	:global(.dark) .map-ring-track {
		fill: none;
	}
</style>
