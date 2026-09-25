import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: process.env.APP_BASE_URL || 'http://localhost:4321',
  output: 'server',
  session: false,
  imageService: 'passthrough',
  adapter: cloudflare(),
  server: { port: 4321 },
});
