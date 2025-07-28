import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import type { StorybookConfig } from '@storybook/react-vite'
import react from '@vitejs/plugin-react'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  logLevel: 'error',

  staticDirs: [{ from: '../assets', to: '/public' }],

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
  `,

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
