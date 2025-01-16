import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), nxViteTsPaths()],
  worker: {
    plugins: () => [nxViteTsPaths()]
  },
  build: {
    target: 'es2022' // Top-level await is supported.
  },
  optimizeDeps: {
    force: true
  }
})
