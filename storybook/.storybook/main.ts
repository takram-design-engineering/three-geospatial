import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.@(mdx|stories.@(js|jsx|ts|tsx))'],
  addons: ['@storybook/addon-essentials', '@storybook/addon-interactions'],
  framework: {
    name: '@storybook/react-vite',
    options: {}
  },
  staticDirs: [
    { from: '../assets', to: '/public' },
    { from: '../../packages/atmosphere/assets', to: '/atmosphere' },
    { from: '../../packages/clouds/assets', to: '/clouds' }
  ],

  viteFinal: async config =>
    mergeConfig(config, {
      optimizeDeps: {
        force: true
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
