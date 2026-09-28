// See https://svelte.dev/docs/kit/types#app.d.ts
import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
		}
		interface PageState {
			/** Concept id shown in the dictionary modal via shallow routing. */
			conceptEntry?: string;
		}
	}
}

export {};
