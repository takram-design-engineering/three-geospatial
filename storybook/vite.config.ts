import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [react(), nxViteTsPaths(), glsl()],
  worker: {
    plugins: () => [nxViteTsPaths(), glsl()]
  },
  build: {
    target: 'es2022' // Top-level await is supported.
  },
  // TODO: I don't understand at all how to tell the optimizer exclude
  // storybook's cache. Put everything that I can think of here.
  optimizeDeps: {
    exclude: [
      'node_modules/.cache/storybook',
      'storybook/node_modules/.cache/storybook',
      '../node_modules/.cache/storybook',
      '../storybook/node_modules/.cache/storybook',
      '../../storybook/node_modules/.cache/storybook'
    ],
    force: true
  }
})
