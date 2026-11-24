import { defineWorkspace } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'node:path';

const alias = { $lib: path.resolve('./src/lib') };

export default defineWorkspace([
	// Component and client-logic tests: jsdom, browser package conditions.
	{
		plugins: [svelte()],
		resolve: { conditions: ['browser'], alias },
		test: {
			name: 'ui',
			environment: 'jsdom',
			setupFiles: ['./tests/setup.ts'],
			include: ['tests/**/*.test.ts'],
			exclude: ['tests/server/**', '**/node_modules/**']
		}
	},
	// Server tests run in Node against a real (temporary) SQLite file, so they
	// must not use the `browser` condition — that selects libSQL's HTTP-only
	// web client (and `ws`'s browser stub), which can't open local files.
	{
		resolve: { alias },
		test: {
			name: 'server',
			environment: 'node',
			include: ['tests/server/**/*.test.ts']
		}
	}
]);
