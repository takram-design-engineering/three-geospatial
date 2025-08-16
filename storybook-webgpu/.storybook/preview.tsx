import type { Preview } from '@storybook/react-vite'

import './style.css'

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: {
      disableSaveFromUI: true
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: ['README', '*', ['README', 'Minimal Setup', '*']]
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
