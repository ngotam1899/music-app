import { defineConfig } from 'vite';

export default defineConfig({
  // VITE_* plus NEXT_PUBLIC_* (public values created by the Supabase ↔ Vercel integration).
  // Never give a secret a NEXT_PUBLIC_ or VITE_ name: these are shipped to the browser.
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  build: { outDir: 'dist', sourcemap: false },
  server: { port: 5173 },
});
