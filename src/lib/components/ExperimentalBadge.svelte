<script lang="ts">
	import { APP_VERSION, STABLE_TARGET } from '$lib/shared/version';

	// Opens on hover/focus for pointer users, and toggles on tap for touch.
	let hovered = $state(false);
	let pinned = $state(false);
	let root: HTMLDivElement | undefined = $state();
	const open = $derived(hovered || pinned);

	function onDocumentPointerDown(e: PointerEvent) {
		if (pinned && root && !root.contains(e.target as Node)) pinned = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			pinned = false;
			hovered = false;
		}
	}
</script>

<svelte:document onpointerdown={onDocumentPointerDown} onkeydown={onKeydown} />

<div
	bind:this={root}
	class="relative"
	role="presentation"
	onpointerenter={(e) => e.pointerType === 'mouse' && (hovered = true)}
	onpointerleave={(e) => e.pointerType === 'mouse' && (hovered = false)}
>
	<button
		type="button"
		class="xp-badge"
		aria-expanded={open}
		aria-controls="experimental-popover"
		onclick={() => (pinned = !pinned)}
		onfocus={() => (hovered = true)}
		onblur={() => (hovered = false)}
	>
		<span class="xp-version">v{APP_VERSION}</span>
		<span class="xp-tag">Experimental</span>
	</button>

	{#if open}
		<div id="experimental-popover" class="xp-popover cc-panel" role="tooltip">
			<div class="cc-stripe"></div>
			<div class="p-4">
				<p class="cc-eyebrow">Version {APP_VERSION} · Experimental</p>
				<p class="mt-2 text-sm leading-relaxed text-slate-700">
					Concept Cartography is in active development. Features, layouts and data structures may change
					as we learn from how people use it.
				</p>
				<p class="mt-2 text-sm leading-relaxed text-slate-700">
					We're committed to shipping a <strong>stable build by {STABLE_TARGET}</strong>.
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.xp-badge {
		display: inline-flex;
		flex-direction: column;
		align-items: stretch;
		overflow: hidden;
		border: 1.5px solid var(--memphis-ink);
		border-radius: 0.45rem;
		font-size: 9px;
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0.04em;
		color: var(--memphis-ink);
		transition:
			transform 150ms ease,
			box-shadow 150ms ease;
	}
	.xp-badge:hover,
	.xp-badge[aria-expanded='true'] {
		transform: translate(-1px, -1px);
		box-shadow: 2px 2px 0 var(--memphis-ink);
	}
	.xp-version {
		background: white;
		padding: 0.2rem 0.4rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.xp-tag {
		border-top: 1.5px solid var(--memphis-ink);
		background: var(--memphis-yellow);
		padding: 0.2rem 0.4rem;
		text-transform: uppercase;
	}
	@media (min-width: 640px) {
		.xp-badge {
			flex-direction: row;
			border-radius: 9999px;
			font-size: 10px;
		}
		.xp-version,
		.xp-tag {
			padding: 0.3rem 0.5rem;
		}
		.xp-tag {
			border-top: 0;
			border-left: 1.5px solid var(--memphis-ink);
		}
	}
	:global(.dark) .xp-badge {
		border-color: #64748b;
		color: #e2e8f0;
	}
	:global(.dark) .xp-version {
		background: #1e293b;
	}
	:global(.dark) .xp-tag {
		border-color: #64748b;
		background: rgb(255 210 63 / 0.18);
		color: #fde68a;
	}
	:global(.dark) .xp-badge:hover,
	:global(.dark) .xp-badge[aria-expanded='true'] {
		box-shadow: 2px 2px 0 var(--memphis-yellow);
	}

	/* On phones the badge sits mid-header, so pin the popover to the viewport
	   gutters instead of the badge to keep it on screen. */
	.xp-popover {
		position: fixed;
		left: 1rem;
		right: 1rem;
		top: 4.25rem;
		z-index: 50;
		overflow: hidden;
	}
	@media (min-width: 640px) {
		.xp-popover {
			position: absolute;
			left: 0;
			right: auto;
			top: calc(100% + 0.6rem);
			width: 20rem;
		}
	}
</style>
