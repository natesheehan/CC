<script lang="ts">
	import { untrack } from 'svelte';
	import { relativeTime } from '$lib/shared/format';
	import type { ClientRelation, ClientRelationComment } from '$lib/shared/types';

	let {
		relation,
		sourceName,
		targetName,
		relationLabelText,
		currentUserId,
		shareUrl,
		onClose,
		onLoadComments,
		onAddComment,
		onDeleteComment
	}: {
		relation: ClientRelation;
		sourceName: string;
		targetName: string;
		relationLabelText: string;
		currentUserId: string;
		shareUrl: string;
		onClose: () => void;
		onLoadComments: () => Promise<ClientRelationComment[]>;
		onAddComment: (body: string) => Promise<ClientRelationComment>;
		onDeleteComment: (commentId: string) => Promise<void>;
	} = $props();

	let comments: ClientRelationComment[] = $state([]);
	let loading = $state(true);
	let loadError = $state('');
	let draft = $state('');
	let posting = $state(false);
	let postError = $state('');
	let copied = $state(false);

	$effect(() => {
		untrack(() => loadComments());
	});

	async function loadComments() {
		loading = true;
		loadError = '';
		try {
			comments = await onLoadComments();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Could not load comments.';
		}
		loading = false;
	}

	async function submitComment(e: SubmitEvent) {
		e.preventDefault();
		const body = draft.trim();
		if (!body) return;
		postError = '';
		posting = true;
		try {
			const created = await onAddComment(body);
			comments = [...comments, created];
			draft = '';
		} catch (err) {
			postError = err instanceof Error ? err.message : 'Could not post comment.';
		}
		posting = false;
	}

	async function removeComment(id: string) {
		try {
			await onDeleteComment(id);
			comments = comments.filter((c) => c.id !== id);
		} catch {
			// best-effort; leave the comment in place if deletion failed
		}
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch {
			// clipboard API may be unavailable; ignore silently
		}
	}
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
	<div class="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
		<div class="flex items-start justify-between gap-2 border-b border-slate-100 px-6 py-4">
			<div class="min-w-0">
				<h2 class="text-lg font-semibold text-slate-800">Relation comments</h2>
				<p class="mt-0.5 truncate text-sm text-slate-500">
					<strong>{sourceName}</strong>
					{relationLabelText}
					<strong>{targetName}</strong>
				</p>
				{#if relation.description}
					<p class="mt-1 text-xs text-slate-400">{relation.description}</p>
				{/if}
			</div>
			<button onclick={onClose} class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close">
				✕
			</button>
		</div>

		<div class="flex-1 space-y-3 overflow-y-auto px-6 py-4">
			{#if loading}
				<p class="text-sm text-slate-400">Loading comments…</p>
			{:else if loadError}
				<p class="text-sm text-red-600">{loadError}</p>
			{:else if comments.length === 0}
				<p class="text-sm text-slate-400">No comments yet. Start the discussion below.</p>
			{:else}
				{#each comments as comment (comment.id)}
					<div class="group rounded-md border border-slate-100 p-2.5">
						<div class="flex items-center justify-between gap-2">
							<div class="flex items-center gap-1.5 text-xs text-slate-500">
								<span
									class="inline-block h-2 w-2 rounded-full"
									style="background-color: {comment.userColor ?? '#94a3b8'}"
								></span>
								<span class="font-medium text-slate-700">{comment.userName ?? 'Unknown'}</span>
								<span>· {relativeTime(comment.createdAt)}</span>
							</div>
							{#if comment.userId === currentUserId}
								<button
									onclick={() => removeComment(comment.id)}
									class="hidden text-xs text-slate-300 hover:text-red-600 group-hover:block"
								>
									Delete
								</button>
							{/if}
						</div>
						<p class="mt-1 whitespace-pre-wrap text-sm text-slate-700">{comment.body}</p>
					</div>
				{/each}
			{/if}
		</div>

		<form onsubmit={submitComment} class="border-t border-slate-100 px-6 py-3">
			{#if postError}<p class="mb-1.5 text-sm text-red-600">{postError}</p>{/if}
			<div class="flex items-end gap-2">
				<textarea
					bind:value={draft}
					rows="2"
					maxlength="2000"
					placeholder="Add a comment…"
					class="flex-1 resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
				></textarea>
				<button
					type="submit"
					disabled={posting || !draft.trim()}
					class="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
				>
					{posting ? 'Posting…' : 'Post'}
				</button>
			</div>
		</form>

		<div class="flex items-center justify-between border-t border-slate-100 px-6 py-3">
			<button onclick={copyLink} class="text-xs font-medium text-blue-600 hover:underline">
				{copied ? 'Link copied!' : '🔗 Copy link to this relation'}
			</button>
			<button onclick={onClose} class="rounded-md px-4 py-1.5 text-sm text-slate-600 hover:bg-slate-100">Close</button>
		</div>
	</div>
</div>
