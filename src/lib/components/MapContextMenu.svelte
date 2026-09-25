<script lang="ts" module>
	import type { IconName } from './Icon.svelte';

	export type MenuItem = {
		label: string;
		icon?: IconName;
		shortcut?: string;
		disabled?: boolean;
		danger?: boolean;
		run: () => void;
	};

	export type MenuSection = {
		id: string;
		title: string;
		icon?: IconName;
		/** Pinned sections (e.g. the clicked node's own actions) are always open. */
		pinned?: boolean;
		items: MenuItem[];
	};

	// Which collapsible sections are open is remembered between menu opens
	// for the rest of the session.
	const openSections = new Set<string>(['create']);
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from './Icon.svelte';

	let {
		x,
		y,
		sections,
		onClose
	}: {
		x: number;
		y: number;
		sections: MenuSection[];
		onClose: () => void;
	} = $props();

	let menuEl: HTMLDivElement | undefined = $state();
	let left = $state(0);
	let top = $state(0);
	let open = $state(new Set(openSections));

	function toggle(id: string) {
		const next = new Set(open);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		open = next;
		openSections.clear();
		for (const s of next) openSections.add(s);
	}

	// Keep the menu fully on screen — re-run whenever it grows or shrinks as
	// sections expand and collapse.
	function place() {
		if (!menuEl) return;
		const pad = 8;
		const rect = menuEl.getBoundingClientRect();
		left = x + rect.width + pad > window.innerWidth ? Math.max(pad, x - rect.width) : x;
		top = y + rect.height + pad > window.innerHeight ? Math.max(pad, window.innerHeight - rect.height - pad) : y;
	}

	onMount(() => {
		left = x;
		top = y;
		place();
		menuEl?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
		const ro = new ResizeObserver(place);
		if (menuEl) ro.observe(menuEl);
		return () => ro.disconnect();
	});

	function onKeydown(e: KeyboardEvent) {
		if (!menuEl) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}
		if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
		e.preventDefault();
		const buttons = Array.from(menuEl.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
		const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
		const next = e.key === 'ArrowDown' ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
		buttons[next]?.focus();
	}

	function onWindowPointerDown(e: PointerEvent) {
		if (menuEl && !menuEl.contains(e.target as Node)) onClose();
	}
</script>

<svelte:window onpointerdown={onWindowPointerDown} onkeydown={onKeydown} onresize={onClose} onblur={onClose} />

<div
	bind:this={menuEl}
	class="map-context-menu fixed z-[60] max-h-[calc(100vh-1rem)] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-lg"
	style="left: {left}px; top: {top}px"
	role="menu"
	tabindex="-1"
	oncontextmenu={(e) => e.preventDefault()}
>
	{#each sections as section, si (section.id)}
		{@const expanded = section.pinned || open.has(section.id)}
		{#if si > 0}
			<div class="my-1 h-px bg-slate-100" role="separator"></div>
		{/if}

		{#if section.pinned}
			<p class="truncate px-2.5 pb-1 pt-1.5 text-xs font-bold text-slate-800">{section.title}</p>
		{:else}
			<button
				type="button"
				class="menu-section-toggle flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500 transition hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"
				aria-expanded={expanded}
				onclick={() => toggle(section.id)}
			>
				{#if section.icon}<Icon name={section.icon} class="h-3.5 w-3.5 opacity-70" />{/if}
				<span class="flex-1">{section.title}</span>
				<span class="text-[10px] font-semibold normal-case tracking-normal text-slate-400">{section.items.length}</span>
				<span class="menu-chevron {expanded ? 'open' : ''}"><Icon name="chevronDown" class="h-3.5 w-3.5" /></span>
			</button>
		{/if}

		{#if expanded}
			<div transition:slide={{ duration: 180, easing: cubicOut }}>
				{#each section.items as item (item.label)}
					<button
						type="button"
						role="menuitem"
						disabled={item.disabled}
						onclick={() => {
							onClose();
							item.run();
						}}
						class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition focus:outline-none disabled:cursor-not-allowed disabled:opacity-35 {item.danger
							? 'text-red-600 hover:bg-red-50 focus:bg-red-50'
							: 'text-slate-700 hover:bg-slate-100 focus:bg-slate-100'}"
					>
						{#if item.icon}
							<Icon name={item.icon} class="h-4 w-4 shrink-0 opacity-70" />
						{:else}
							<span class="h-4 w-4 shrink-0"></span>
						{/if}
						<span class="flex-1 truncate">{item.label}</span>
						{#if item.shortcut}
							<kbd class="rounded border border-slate-200 px-1.5 font-sans text-[10px] font-semibold text-slate-400">{item.shortcut}</kbd>
						{/if}
					</button>
				{/each}
			</div>
		{/if}
	{/each}
</div>

<style>
	.map-context-menu {
		animation: menu-in 140ms cubic-bezier(0.22, 1, 0.36, 1) both;
		transform-origin: top left;
	}
	.menu-chevron {
		display: flex;
		transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
		transform: rotate(-90deg);
	}
	.menu-chevron.open {
		transform: rotate(0deg);
	}
	@keyframes menu-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}

	:global(.dark) .map-context-menu {
		background: #172033;
	}
	:global(.dark) .map-context-menu .bg-slate-100 {
		background: #273449;
	}
	:global(.dark) .map-context-menu button:not(:disabled):hover,
	:global(.dark) .map-context-menu button:focus {
		background: #273449;
	}
	:global(.dark) .map-context-menu .text-red-600 {
		color: #f87171;
	}
</style>
