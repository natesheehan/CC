import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Pin serverless functions to the Vercel region(s) closest to the database.
// Every request makes one or more database round trips, and Vercel bills for
// the time a function is alive — so a function in iad1 talking to a database
// in Frankfurt pays ~90ms per round trip that a co-located one doesn't.
//
// Set at build time, e.g. in Vercel → Settings → Environment Variables:
//   VERCEL_FUNCTION_REGIONS=fra1          (one region; Hobby allows only one)
//   VERCEL_FUNCTION_REGIONS=fra1,iad1     (several; Pro/Enterprise)
// Unset → Vercel's project default, i.e. no change. See README.
const regions = (process.env.VERCEL_FUNCTION_REGIONS ?? '')
	.split(',')
	.map((r) => r.trim())
	.filter(Boolean);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(regions.length > 0 ? { regions } : {})
	}
};

export default config;
