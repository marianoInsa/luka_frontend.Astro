import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': '/src/test-stubs/cloudflare-workers.ts' } },
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
