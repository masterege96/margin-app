import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// Port 3000 matches Supabase's default Site URL, so email confirmation links land on the dev server.
// `vite --mode fake` swaps the real Supabase client for an in-memory fake (tests/fake-supabase.js)
// so the app can be clicked through without a network or a real account.
export default defineConfig(({ mode }) => ({
  build: { target: 'es2022' },
  server: { port: 3000, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 3000, strictPort: true },
  resolve: {
    alias:
      mode === 'fake'
        ? [{ find: /^\.\/supabase\.js$/, replacement: fileURLToPath(new URL('./tests/fake-supabase.js', import.meta.url)) }]
        : [],
  },
  test: { environment: 'node' },
}));
