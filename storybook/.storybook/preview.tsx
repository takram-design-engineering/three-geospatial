import { Preview } from '@storybook/react'
import { LevaPanel, LevaStoreProvider, useCreateStore } from 'leva'
import React, { useState } from 'react'
import { useKey } from 'react-use'

import './style.css'

const preview: Preview = {
  parameters: {
    controls: {
      disableSaveFromUI: true
    },
    options: {
      storySort: {
        method: 'alphabetical',
        order: ['README', '*', ['README', '*']]
      }
    }
  },
  decorators: [
    Story => {
      const store = useCreateStore()
      const [hidden, setHidden] = useState(false)
      useKey(
        event => event.target === document.body && event.key === 'h',
        () => {
          setHidden(value => !value)
        }
      )

      return (
        <LevaStoreProvider store={store}>
          <LevaPanel store={store} hidden={hidden} />
          <Story />
        </LevaStoreProvider>
      )
    }
  ]
}

export default preview
