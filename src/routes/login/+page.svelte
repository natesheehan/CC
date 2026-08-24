<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign in · Concept Cartography</title>
</svelte:head>

<div class="flex flex-1 items-center justify-center bg-slate-50 px-4">
	<div class="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
		<h1 class="text-xl font-semibold text-slate-800">Who's mapping today?</h1>
		<p class="mt-1 text-sm text-slate-500">
			Enter a display name. If it already exists, you'll sign in as that person — every edit and
			concept you add will be attributed to this name.
		</p>

		<form
			method="POST"
			class="mt-6 space-y-3"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<div>
				<label for="name" class="mb-1 block text-sm font-medium text-slate-700">Display name</label>
				<input
					id="name"
					name="name"
					type="text"
					required
					minlength="2"
					maxlength="40"
					value={form?.name ?? ''}
					placeholder="e.g. Alex Rivera"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				/>
			</div>

			{#if form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}

			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
			>
				{submitting ? 'Signing in…' : 'Continue'}
			</button>
		</form>
	</div>
</div>
