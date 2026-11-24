<script lang="ts" module>
	export interface LiveToast {
		id: string;
		name: string;
		color: string;
		text: string;
		/** Optional "Show" action, e.g. jump to the concept that changed. */
		action?: { label: string; run: () => void };
	}
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { initials } from '$lib/client/live.svelte';

	let { toasts, onDismiss }: { toasts: LiveToast[]; onDismiss: (id: string) => void } = $props();
</script>

<!-- Polite live region so screen readers hear collaborators' changes too. -->
<div
	class="pointer-events-none absolute bottom-16 left-1/2 z-30 flex w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 flex-col-reverse gap-2 sm:bottom-20"
	aria-live="polite"
	role="log"
	aria-label="Live changes from collaborators"
>
	{#each toasts as t (t.id)}
		<div
			class="live-toast pointer-events-auto flex items-center gap-2.5 rounded-xl bg-white py-2 pl-2.5 pr-2 text-sm"
			style="--peer: {t.color}"
			in:fly={{ y: 16, duration: 200 }}
			out:fly={{ y: 8, duration: 150 }}
			animate:flip={{ duration: 200 }}
		>
			<span class="toast-avatar" aria-hidden="true">{initials(t.name)}</span>
			<p class="min-w-0 flex-1 text-slate-700">
				<strong>{t.name}</strong>
				{t.text}
			</p>
			{#if t.action}
				<button
					type="button"
					class="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
					onclick={() => {
						t.action!.run();
						onDismiss(t.id);
					}}
				>
					{t.action.label}
				</button>
			{/if}
			<button
				type="button"
				class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
				aria-label="Dismiss"
				onclick={() => onDismiss(t.id)}
			>
				✕
			</button>
		</div>
	{/each}
</div>

<style>
	.live-toast {
		border: 2px solid var(--memphis-ink);
		border-left: 6px solid var(--peer);
		box-shadow: 3px 3px 0 var(--memphis-ink);
	}
	:global(.dark) .live-toast {
		border-color: #475569;
		border-left-color: var(--peer);
		box-shadow: 3px 3px 0 #0b1220;
	}
	.toast-avatar {
		display: inline-flex;
		height: 1.6rem;
		width: 1.6rem;
		flex-shrink: 0;
		align-items: center;
		justify-content: center;
		border-radius: 9999px;
		background: var(--peer);
		font-size: 10px;
		font-weight: 700;
		color: white;
	}
</style>
