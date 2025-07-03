import type { Preview } from '@storybook/react-vite'
import { LevaPanel, LevaStoreProvider, useCreateStore } from 'leva'
import { styled } from 'leva/plugin'
import { useCallback, useState } from 'react'
import { useKey } from 'react-use'

import './style.css'

export const Button = styled('button', {
  display: 'block',
  $reset: '',
  fontWeight: '$button',
  height: '$rowHeight',
  borderStyle: 'none',
  borderRadius: '$sm',
  backgroundColor: '$elevation1',
  color: '$highlight1',
  '&:not(:disabled)': {
    color: '$highlight3',
    backgroundColor: '$elevation3',
    cursor: 'pointer',
    $hover: '$accent3',
    $active: '$accent3 $accent1',
    $focus: ''
  }
})

const preview: Preview = {
  parameters: {
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
  decorators: [
    Story => {
      const [hidden, setHidden] = useState(false)
      useKey(
        event => event.target === document.body && event.key === 'h',
        () => {
          setHidden(value => !value)
        }
      )

      const [expanded, setExpanded] = useState(false)
      const handleExpand = useCallback(() => {
        setExpanded(value => !value)
      }, [])

      const store = useCreateStore()
      return (
        <LevaStoreProvider store={store}>
          <LevaPanel
            store={store}
            hidden={hidden}
            titleBar={{
              title: (
                <Button onClick={handleExpand}>
                  {expanded ? '→ narrow ←' : '← wide →'}
                </Button>
              )
            }}
            theme={{
              ...(expanded && {
                sizes: {
                  rootWidth: '420px'
                }
              })
            }}
          />
          <Story />
        </LevaStoreProvider>
      )
    }
  ]
}

export default preview
