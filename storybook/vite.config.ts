import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  worker: {
    plugins: () => [nxViteTsPaths(), glsl()]
  },
  build: {
    target: 'es2022' // Top-level await is supported.
  },
  optimizeDeps: {
    exclude: ['node_modules/.cache/storybook']
  }
})
