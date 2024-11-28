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
  staticDirs: ['../assets', '../../packages/atmosphere/assets'],

  viteFinal: async config =>
    mergeConfig(config, {
      plugins: [react(), nxViteTsPaths(), glsl()],
      worker: {
        plugins: () => [nxViteTsPaths()]
      },
      optimizeDeps: {
        exclude: ['node_modules/.cache/sb-vite']
      }
    }),

  previewHead: head => `
    ${head}
    <link rel='preconnect' href='https://fonts.googleapis.com' />
    <link
      rel='preconnect'
      href='https://fonts.gstatic.com'
      crossOrigin='anonymous'
    />
    <link
      href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400&display=swap'
      rel='stylesheet'
    />
  `
}

export default config

// To customize your Vite configuration you can use the viteFinal field.
// Check https://storybook.js.org/docs/react/builders/vite#configuration
// and https://nx.dev/recipes/storybook/custom-builder-configs
