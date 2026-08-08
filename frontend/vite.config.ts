import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * maplibre-gl's worker script has its own internal relative import
 * ("./maplibre-gl-shared.mjs"), so the pair must land in the output together, unhashed and
 * byte-for-byte as published: Vite's normal asset pipeline either fingerprints just the one
 * file (breaking the relative import) or tries to parse it as source, neither of which this
 * pre-built pair tolerates.
 */
function copyMaplibreWorker(): Plugin {
  return {
    name: 'copy-maplibre-worker',
    apply: 'build',
    async writeBundle(options) {
      const outDir = path.resolve(options.dir ?? 'dist', 'maplibre-gl')
      await mkdir(outDir, { recursive: true })
      for (const file of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
        await cp(
          path.resolve('node_modules/maplibre-gl/dist', file),
          path.join(outDir, file),
        )
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyMaplibreWorker()],
  optimizeDeps: {
    // The dep optimizer rewrites maplibre-gl without emitting its web worker
    // chunk, which breaks the dev server. Serve the package as published.
    exclude: ['maplibre-gl'],
  },
  server: {
    proxy: {
      // Mirrors Caddy's handle_path /api/* in production, so src/api.ts can call the same
      // "/api/..." paths in dev without knowing where the backend actually runs.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
})
