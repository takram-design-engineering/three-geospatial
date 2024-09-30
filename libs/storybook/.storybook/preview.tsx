import { Preview } from '@storybook/react'
import React from 'react'

import './style.css'

const preview: Preview = {
  parameters: {
    options: {
      showPanel: false
    },
    controls: {
      disableSaveFromUI: true
    }
  },
  decorators: (Story, { parameters }) => <Story />
}

export default preview
