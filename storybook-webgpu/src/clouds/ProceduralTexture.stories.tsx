import type { Meta } from '@storybook/react-vite'

import {
  CloudShapeDetailNode,
  CloudShapeNode,
  LocalWeatherNode,
  TurbulenceNode
} from '@takram/three-clouds/webgpu'

import { createStory } from '../components/createStory'
import { Story as Story2D } from './ProceduralTexture-2D'
import { Story as Story3D } from './ProceduralTexture-3D'

import Code2D from './ProceduralTexture-2D?raw'
import Code3D from './ProceduralTexture-3D?raw'

export default {
  title: 'clouds/Procedural Texture',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const LocalWeather = createStory(Story2D, {
  props: {
    node: new LocalWeatherNode()
  },
  args: {
    zoom: 4
  },
  parameters: {
    docs: {
      source: {
        code: Code2D
      }
    }
  }
})

export const Shape = createStory(Story3D, {
  props: {
    node: new CloudShapeNode()
  },
  args: {
    zoom: 1
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
    zoom: 4
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
    zoom: 4
  },
  parameters: {
    docs: {
      source: {
        code: Code2D
      }
    }
  }
})
