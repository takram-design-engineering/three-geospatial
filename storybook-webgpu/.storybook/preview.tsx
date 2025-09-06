import type { Preview } from '@storybook/react-vite'
import { ConfigProvider, theme } from 'antd'
import { themes } from 'storybook/theming'

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
      // WORKAROUND: Cannot annotate type in storySort():
      // {
      //   type: string  // e.g. 'docs' | 'story'
      //   id: string    // e.g. 'package-category--story-name'
      //   name: string  // e.g. 'Story Name'
      //   title: string // e.g. 'package/Category'
      //   tags: string[]
      // }
      storySort: (a, b) => {
        if (a.type !== b.type) {
          return a.type === 'docs' ? -1 : 1 // Bring docs first
        }
        const pathA = a.title.split('/')
        const pathB = b.title.split('/')
        const depthA = pathA.length + +(pathA[pathA.length - 1] !== a.name)
        const depthB = pathB.length + +(pathB[pathB.length - 1] !== b.name)
        if (depthA !== depthB) {
          return depthA - depthB // Bring shallow stories first
        }
        const orderA = +(
          a.tags.find(tag => tag.startsWith('order:'))?.split(':')[1] ?? 0
        )
        const orderB = +(
          b.tags.find(tag => tag.startsWith('order:'))?.split(':')[1] ?? 0
        )
        if (orderA !== orderB) {
          return orderA - orderB
        }
        return a.title.localeCompare(b.title, undefined, { numeric: true })
      }
    }
  },
  initialGlobals: {
    backgrounds: {
      value: 'dark'
    }
  },
  decorators: [
    Story => (
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            fontFamily: `Inter, ${themes.normal.fontBase}`
          }
        }}
      >
        <Story />
      </ConfigProvider>
    )
  ]
}

export default preview
