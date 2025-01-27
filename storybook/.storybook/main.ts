import path from 'path'
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
      // TODO: I don't understand at all how to tell the optimizer exclude
      // storybook's cache. Put everything that I can think of here.
      optimizeDeps: {
        exclude: [path.resolve(__dirname, '../node_modules/.cache/storybook')]
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
