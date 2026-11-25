import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: { port: 3000, host: true },
  ssr: { noExternal: [] },
  // Keep fonts as files: CSP allows font-src 'self' only, so no data: URLs.
  build: { assetsInlineLimit: 0 }
});
