import type { Config } from '@sveltejs/adapter-vercel';

/**
 * Vercel function settings for small, I/O-bound JSON endpoints (the live
 * heartbeat and map mutations). They hold a few MB of memory and spend
 * nearly all their time waiting on the database, and Vercel bills memory ×
 * duration — so allocating 256 MB instead of the default is up to a 4×
 * saving on these routes with no behaviour change.
 *
 * Every route using this exact object is bundled into the *same* function
 * by adapter-vercel (it groups routes by identical config), so the frequent
 * heartbeats keep that function warm for the mutations too.
 *
 * Memory is configurable on Vercel Pro/Enterprise. If the project uses
 * Fluid compute's CPU presets, check the deployed function's memory in the
 * dashboard: Vercel may apply the preset instead.
 */
export const LIGHT_FUNCTION_CONFIG: Config = { memory: 256 };
