import type { Meta } from '@storybook/react-vite'

import {
  CloudShapeDetailNode,
  CloudShapeNode,
  TurbulenceNode
} from '@takram/three-clouds/webgpu'

import { createStory } from '../components/createStory'
import { Story as Story2D } from './Textures-2D'
import { Story as Story3D } from './Textures-3D'

import Code2D from './Textures-2D?raw'
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

export const Turbulence = createStory(Story2D, {
  props: {
    node: new TurbulenceNode()
  },
  args: {
    zoom: 4,
    toneMappingExposure: 1
  },
  parameters: {
    docs: {
      source: {
        code: Code2D
      }
    }
  }
})
