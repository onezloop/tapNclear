import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // The app is served from the /tapNclear/ sub-path, not the domain root, so the dev server
  // mounts there too and dev matches prod. Assets in index.html are still referenced with
  // './' rather than a leading slash: a public/ asset written as '/icon.svg' would resolve
  // to the domain root and 404 under the sub-path.
  base: '/tapNclear/',
  build: {
    // GitHub Pages serves the site from docs/, not dist/.
    outDir: 'docs',
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
