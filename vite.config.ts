import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The terminal is served at e-x.club/terminal: the landing site's Vercel
// project proxies that path to this deployment, so every built asset must
// resolve under the prefix. Vite rewrites the public-dir references in
// index.html for the base; JS-side paths read import.meta.env.BASE_URL.
export default defineConfig({
  base: '/terminal/',
  // the files land in dist/terminal/ too, so on this project's own Vercel
  // URL /terminal/assets/... is a real file and needs no asset rewrites
  build: { outDir: 'dist/terminal', emptyOutDir: true },
  plugins: [react()],
});
