<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import Icon, { type IconName } from './Icon.svelte';

	const SEEN_KEY = 'concept-cartography-map-help-seen';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	let seen = $state(true);
	let rootEl: HTMLDivElement | undefined = $state();

	type Row = { keys: string[]; text: string };
	const SECTIONS: { title: string; icon: IconName; accent: string; rows: Row[] }[] = [
		{
			title: 'Move around',
			icon: 'move',
			accent: 'var(--memphis-cyan)',
			rows: [
				{ keys: ['Drag'], text: 'empty space to pan' },
				{ keys: ['Scroll'], text: 'to zoom toward the cursor' },
				{ keys: ['0'], text: 'fit the whole map in view' },
				{ keys: ['Minimap'], text: 'click to jump to an area' }
			]
		},
		{
			title: 'Build',
			icon: 'plus',
			accent: 'var(--memphis-pink)',
			rows: [
				{ keys: ['N'], text: 'add a concept' },
				{ keys: ['L'], text: 'link two concepts' },
				{ keys: ['Right-click'], text: 'empty space to add a concept right there' },
				{ keys: ['Drag'], text: 'a concept to move it — saved for everyone' }
			]
		},
		{
			title: 'Explore',
			icon: 'eye',
			accent: 'var(--memphis-yellow)',
			rows: [
				{ keys: ['Click'], text: 'a concept to highlight it' },
				{ keys: ['Double-click'], text: 'a concept for its definition and links' },
				{ keys: ['Click'], text: 'a link to read and join its discussion' },
				{ keys: ['Hover'], text: 'a concept to spotlight its neighbours' },
				{ keys: ['/'], text: 'search concepts by name or definition' }
			]
		},
		{
			title: 'Focus',
			icon: 'target',
			accent: 'var(--memphis-purple)',
			rows: [
				{ keys: ['Set center'], text: 'fades concepts not linked to it — Esc clears' },
				{ keys: ['Arrange'], text: 'lays the map out in rings around the center' },
				{ keys: ['Legend'], text: 'click a relation type to show or hide it' },
				{ keys: ['F'], text: 'full screen' }
			]
		}
	];

	onMount(() => {
		try {
			seen = localStorage.getItem(SEEN_KEY) === '1';
		} catch {
			seen = true;
		}
	});

	function toggle() {
		open = !open;
		if (open && !seen) {
			seen = true;
			try {
				localStorage.setItem(SEEN_KEY, '1');
			} catch {
				// ignore
			}
		}
	}

	function onWindowKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') open = false;
		const el = e.target as HTMLElement | null;
		if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
		if (e.key === '?' && !e.metaKey && !e.ctrlKey) toggle();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="relative" bind:this={rootEl}>
	<button
		type="button"
		onclick={toggle}
		aria-expanded={open}
		aria-haspopup="dialog"
		class="map-help-btn relative flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold {open ? 'is-open' : ''}"
		title="How this map works (?)"
	>
		<Icon name="help" />
		<span class="hidden sm:inline">How it works</span>
		{#if !seen}
			<span class="map-help-ping" aria-hidden="true"></span>
		{/if}
	</button>

	{#if open}
		<!-- Centred dialog, capped to the viewport so it never runs off-screen;
		     only the middle section scrolls. -->
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
			role="presentation"
			transition:fade={{ duration: 150 }}
			onclick={(e) => {
				if (e.target === e.currentTarget) open = false;
			}}
		>
		<div
			class="map-help-panel flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="How this map works"
		>
			<div class="map-help-hero relative shrink-0 overflow-hidden px-5 pb-4 pt-5">
				<button
					type="button"
					onclick={() => (open = false)}
					class="map-help-close absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg"
					aria-label="Close guide"
				>
					<Icon name="x" />
				</button>
				<svg class="pointer-events-none absolute -top-4 right-10 hidden h-32 w-40 opacity-90 sm:block" viewBox="0 0 160 120" aria-hidden="true">
					<path d="M30 80 Q 70 30 110 50" class="map-help-edge" style="--edge: #ff3d81" />
					<path d="M110 50 Q 130 85 95 100" class="map-help-edge dashed" style="--edge: #00c2d1" />
					<circle cx="30" cy="80" r="13" class="map-help-node" />
					<circle cx="110" cy="50" r="16" class="map-help-node central" />
					<circle cx="95" cy="100" r="10" class="map-help-node" />
				</svg>
				<p class="text-[11px] font-bold uppercase tracking-[0.18em] text-memphis-pink">Quick guide</p>
				<h2 class="mt-1 max-w-sm text-xl text-slate-900" style="font-family: 'Archivo Black', Inter, sans-serif">
					Concepts are circles, relationships are lines.
				</h2>
				<p class="mt-1.5 max-w-md text-sm text-slate-600">
					Everyone on this map edits the same canvas. Colour tells you the kind of relationship: an arrow shows
					direction, a dashed line means it runs both ways.
				</p>
			</div>

			<div class="grid min-h-0 gap-3 overflow-y-auto p-4 sm:grid-cols-2">
				{#each SECTIONS as section (section.title)}
					<section class="map-help-card" style="--accent: {section.accent}">
						<h3 class="flex items-center gap-2 text-sm font-bold text-slate-800">
							<span class="map-help-badge"><Icon name={section.icon} class="h-3.5 w-3.5" /></span>
							{section.title}
						</h3>
						<ul class="mt-2 space-y-1.5">
							{#each section.rows as row}
								<li class="flex items-baseline gap-2 text-[13px] text-slate-600">
									{#each row.keys as key}
										<kbd class="map-help-kbd">{key}</kbd>
									{/each}
									<span>{row.text}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>

			<div class="map-help-footer flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
				<p class="flex items-center gap-2 font-semibold text-slate-700">
					<Icon name="mouse" class="h-4 w-4 text-memphis-pink" />
					Right-click anywhere on the map for every action.
				</p>
				<a href="/docs/get-started" class="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-800">
					<Icon name="book" class="h-4 w-4" />
					Read the docs
				</a>
			</div>
		</div>
		</div>
	{/if}
</div>

<style>
	.map-help-btn {
		border: 2px solid var(--memphis-ink);
		background: var(--memphis-yellow);
		color: var(--memphis-ink);
		box-shadow: 3px 3px 0 var(--memphis-ink);
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}
	.map-help-btn:hover,
	.map-help-btn.is-open {
		transform: translate(-1px, -1px);
		box-shadow: 4px 4px 0 var(--memphis-ink);
	}
	.map-help-btn:active {
		transform: translate(2px, 2px);
		box-shadow: 0 0 0 var(--memphis-ink);
	}
	.map-help-ping {
		position: absolute;
		right: -0.3rem;
		top: -0.3rem;
		height: 0.7rem;
		width: 0.7rem;
		border: 2px solid var(--memphis-ink);
		border-radius: 9999px;
		background: var(--memphis-pink);
		animation: map-help-ping 1.6s ease-out infinite;
	}

	.map-help-panel {
		border: 2px solid var(--memphis-ink);
		background: white;
		box-shadow: 6px 6px 0 var(--memphis-ink);
		animation: map-help-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
		transform-origin: center;
	}
	.map-help-close {
		border: 2px solid var(--memphis-ink);
		background: white;
		color: var(--memphis-ink);
	}
	.map-help-close:hover {
		background: var(--memphis-yellow);
	}
	:global(.dark) .map-help-close {
		border-color: #475569;
		background: #1e293b;
		color: #e2e8f0;
	}
	.map-help-hero {
		background-color: var(--memphis-cream);
		background-image: radial-gradient(rgb(20 17 15 / 0.1) 1.2px, transparent 1.2px);
		background-size: 14px 14px;
		border-bottom: 2px solid var(--memphis-ink);
	}
	.map-help-edge {
		fill: none;
		stroke: var(--edge);
		stroke-width: 4;
		stroke-linecap: round;
	}
	.map-help-edge.dashed {
		stroke-dasharray: 7 6;
	}
	.map-help-node {
		fill: white;
		stroke: var(--memphis-ink);
		stroke-width: 3;
	}
	.map-help-node.central {
		fill: #fff7e0;
		stroke: #f59e0b;
		stroke-width: 4;
	}
	.map-help-card {
		border: 1.5px solid rgb(20 17 15 / 0.15);
		border-left: 4px solid var(--accent);
		border-radius: 0.75rem;
		padding: 0.75rem 0.9rem;
	}
	.map-help-badge {
		display: flex;
		height: 1.5rem;
		width: 1.5rem;
		align-items: center;
		justify-content: center;
		border: 2px solid var(--memphis-ink);
		border-radius: 0.4rem;
		background: var(--accent);
		color: var(--memphis-ink);
	}
	.map-help-kbd {
		flex-shrink: 0;
		border: 1.5px solid rgb(20 17 15 / 0.25);
		border-bottom-width: 3px;
		border-radius: 0.35rem;
		background: #f8fafc;
		padding: 0 0.35rem;
		font-family: inherit;
		font-size: 11px;
		font-weight: 700;
		color: #334155;
	}
	.map-help-footer {
		border-top: 1.5px solid rgb(20 17 15 / 0.12);
		background: #f8fafc;
	}

	:global(.dark) .map-help-panel {
		border-color: #475569;
		background: #172033;
		box-shadow: 6px 6px 0 var(--memphis-cyan);
	}
	:global(.dark) .map-help-hero {
		background-color: #0f172a;
		background-image: radial-gradient(rgb(255 255 255 / 0.07) 1.2px, transparent 1.2px);
		border-color: #475569;
	}
	:global(.dark) .map-help-node {
		fill: #1e293b;
		stroke: #e2e8f0;
	}
	:global(.dark) .map-help-node.central {
		fill: #3b2a12;
		stroke: #fbbf24;
	}
	:global(.dark) .map-help-card {
		border-color: rgb(148 163 184 / 0.25);
		border-left-color: var(--accent);
	}
	:global(.dark) .map-help-kbd {
		border-color: rgb(148 163 184 / 0.4);
		background: #1e293b;
		color: #e2e8f0;
	}
	:global(.dark) .map-help-footer {
		border-color: rgb(148 163 184 / 0.2);
		background: #0f172a;
	}

	@keyframes map-help-in {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.97);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@keyframes map-help-ping {
		0% {
			box-shadow: 0 0 0 0 rgb(255 61 129 / 0.6);
		}
		100% {
			box-shadow: 0 0 0 10px rgb(255 61 129 / 0);
		}
	}
</style>
