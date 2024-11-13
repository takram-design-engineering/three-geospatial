import { Preview } from '@storybook/react'
import { LevaPanel, LevaStoreProvider, useCreateStore } from 'leva'
import React from 'react'

import './style.css'

const preview: Preview = {
  parameters: {
    controls: {
      disableSaveFromUI: true
    }
  },
  decorators: [
    Story => {
      const store = useCreateStore()
      return (
        <LevaStoreProvider store={store}>
          <LevaPanel store={store} />
          <Story />
        </LevaStoreProvider>
      )
    }
  ]
}

export default preview
