import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // The dep optimizer rewrites maplibre-gl without emitting its web worker
    // chunk, which breaks the dev server. Serve the package as published.
    exclude: ['maplibre-gl'],
  },
})