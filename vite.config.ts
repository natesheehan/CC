import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// Pre-bundle deps that are only imported by lazily loaded routes (the map
	// canvas), so Vite doesn't discover them mid-session and re-optimise —
	// which invalidates the dep URLs an already-open tab is holding.
	optimizeDeps: {
		include: ['d3-force', 'marked']
	},
	server: {
		host: true,
		port: 5173
	}
});
