import type { Meta } from '@storybook/react-vite'

import {
  CloudShapeDetailNode,
  CloudShapeNode
} from '@takram/three-clouds/webgpu'

import { createStory } from '../components/createStory'
import { Story as Story3D } from './Textures-3D'

import Code3D from './Textures-3D?raw'

export default {
  title: 'clouds/Textures',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Shape = createStory(Story3D, {
  props: {
    node: new CloudShapeNode()
  },
  args: {
    zoom: 2,
    toneMappingExposure: 1
  },
  parameters: {
    docs: {
      source: {
        code: Code3D
      }
    }
  }
})

export const ShapeDetail = createStory(Story3D, {
  props: {
    node: new CloudShapeDetailNode()
  },
  args: {
    zoom: 2,
    toneMappingExposure: 1
  },
  parameters: {
    docs: {
      source: {
        code: Code3D
      }
    }
  }
})
