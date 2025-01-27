import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), nxViteTsPaths()],
  worker: {
    plugins: () => [nxViteTsPaths()]
  }
})
