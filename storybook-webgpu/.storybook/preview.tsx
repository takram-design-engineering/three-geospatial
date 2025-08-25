import type { Preview } from '@storybook/react-vite'

import { docs } from './theme'

import './style.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      disableSaveFromUI: true
    },
    docs: {
      theme: docs
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: ['README', '*', ['README', '*']]
      }
    }
  },
  initialGlobals: {
    backgrounds: {
      value: 'dark'
    }
  }
}

export default preview
