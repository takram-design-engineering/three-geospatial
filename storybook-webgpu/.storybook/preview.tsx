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
        return a.title.localeCompare(b.title, undefined, { numeric: true })
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
