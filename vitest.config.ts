import { defineConfig } from 'vitest/config';

// Root config is intentionally neutral: per-project settings (environment,
// resolve conditions, plugins) live in vitest.workspace.ts, because options
// set here leak into every project — e.g. the `browser` resolve condition the
// component tests need would make the server tests load libSQL's web client.
export default defineConfig({});
