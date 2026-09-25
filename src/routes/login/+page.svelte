<script lang="ts">
	import { enhance } from '$app/forms';
	import Icon from '$lib/components/Icon.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Concept Cartography</title>
</svelte:head>

<div class="cc-hero flex flex-1 items-center justify-center !border-b-0 px-4 py-12">
	<div class="cc-panel grid w-full max-w-3xl overflow-hidden md:grid-cols-[1fr_1.1fr]">
		<!-- Left: a little map of what you're signing in to -->
		<div class="login-art relative hidden flex-col justify-between p-8 md:flex">
			<div>
				<p class="cc-eyebrow">Concept Cartography</p>
				<p class="cc-display mt-2 text-2xl leading-tight text-slate-900">Every idea you add is credited to you.</p>
			</div>
			<svg viewBox="0 0 220 150" class="cc-hero-art mt-6 w-full" aria-hidden="true">
				<path d="M40 110 Q 85 30 140 52" class="cc-art-edge" stroke="#ff3d81" />
				<path d="M140 52 Q 195 90 160 125" class="cc-art-edge dashed" stroke="#00c2d1" />
				<path d="M40 110 Q 100 145 160 125" class="cc-art-edge" stroke="#7c3aed" style="animation-delay: 450ms" />
				<circle cx="44" cy="114" r="16" class="cc-art-shadow" />
				<circle cx="40" cy="110" r="16" class="cc-art-node" />
				<circle cx="144" cy="56" r="21" class="cc-art-shadow" />
				<circle cx="140" cy="52" r="21" class="cc-art-node central" style="animation-delay: 200ms" />
				<circle cx="164" cy="129" r="12" class="cc-art-shadow" />
				<circle cx="160" cy="125" r="12" class="cc-art-node" style="animation-delay: 350ms" />
			</svg>
		</div>

		<div class="p-8">
			<p class="cc-eyebrow md:hidden">Concept Cartography</p>
			<h1 class="cc-display text-3xl leading-tight text-slate-900">Who's mapping today?</h1>
			<p class="cc-muted mt-3 text-sm leading-relaxed">
				Enter a display name. If it already exists, you'll sign in as that person — every edit and concept you add
				will be attributed to this name.
			</p>

			<form
				method="POST"
				class="mt-6 space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update();
						submitting = false;
					};
				}}
			>
				<div>
					<label for="name" class="mb-1.5 block text-sm font-bold text-slate-700">Display name</label>
					<input
						id="name"
						name="name"
						type="text"
						required
						minlength="2"
						maxlength="40"
						value={form?.name ?? ''}
						placeholder="e.g. Alex Rivera"
						autocomplete="nickname"
					/>
				</div>

				{#if form?.error}
					<p class="text-sm font-semibold text-red-600">{form.error}</p>
				{/if}

				<button type="submit" disabled={submitting} class="cc-btn cc-btn-primary w-full !py-2.5">
					{submitting ? 'Signing in…' : 'Continue'}
					{#if !submitting}<Icon name="chevronRight" />{/if}
				</button>
			</form>
		</div>
	</div>
</div>

<style>
	.login-art {
		border-right: 2px solid var(--memphis-ink);
		background: #fff7e0;
	}
	:global(.dark) .login-art {
		border-color: #475569;
		background: #0f172a;
	}
</style>
