import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: process.env.APP_BASE_URL || 'http://localhost:4321',
  output: 'server',
  session: false,
  adapter: cloudflare({ imageService: 'passthrough', prerenderEnvironment: 'node' }),
  server: { port: 4321 },
});
