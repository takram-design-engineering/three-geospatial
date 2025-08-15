import type { Preview } from '@storybook/react-vite'
import { Preview as PreviewClass } from 'storybook/preview-api'

import './style.css'

import { STORY_ARGS_UPDATED } from 'storybook/internal/core-events'

// WORKAROUND: Prevent Storybook from storing args state in URL.
const onUpdateArgs = PreviewClass.prototype.onUpdateArgs
PreviewClass.prototype.onUpdateArgs = async function (...args) {
  const channel = this.channel
  this.channel = {
    emit: (event, ...args) => {
      if (event !== STORY_ARGS_UPDATED) {
        channel.emit(event, ...args)
      }
    }
  }
  await onUpdateArgs.apply(this, args)
  this.channel = channel
}

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
