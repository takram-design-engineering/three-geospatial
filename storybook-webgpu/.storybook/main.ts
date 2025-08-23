import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import type { StorybookConfig } from '@storybook/react-vite'
import react from '@vitejs/plugin-react'
import { mergeConfig } from 'vite'

const require = createRequire(import.meta.url)

const config: StorybookConfig = {
  stories: ['../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: [getAbsolutePath('@storybook/addon-docs')],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {}
  },
  features: {
    actions: false,
    interactions: false
  },

  staticDirs: [{ from: '../assets', to: '/public' }],

  viteFinal: config =>
    mergeConfig(config, {
      plugins: [react(), nxViteTsPaths()],
      worker: {
        plugins: () => [nxViteTsPaths()]
      },
      build: {
        sourcemap: process.env.NODE_ENV !== 'production'
      }
    })
}

export default config

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs

function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')))
}
