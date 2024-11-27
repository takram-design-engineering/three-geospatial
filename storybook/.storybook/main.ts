import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import type { StorybookConfig } from '@storybook/react-vite'
import react from '@vitejs/plugin-react'
import { mergeConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

const config: StorybookConfig = {
  stories: ['../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  staticDirs: [
    '../../packages/atmosphere/assets',
    '../../packages/effects/assets'
  ],

  viteFinal: async config =>
    mergeConfig(config, {
      plugins: [react(), nxViteTsPaths(), glsl()],
      worker: {
        plugins: () => [nxViteTsPaths()]
      },
      optimizeDeps: {
        exclude: ['node_modules/.cache/sb-vite']
      }
    })
}

export default config

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs
