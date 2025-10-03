import type { Meta } from '@storybook/react-vite'

import { createStory } from '../components/createStory'
import { Story as Story2D } from './AtmosphereLUT-2D'
import { Story as Story3D } from './AtmosphereLUT-3D'

import Code2D from './AtmosphereLUT-2D?raw'
import Code3D from './AtmosphereLUT-3D?raw'

export default {
  title: 'atmosphere/Atmosphere LUT',
  parameters: {
    docs: {
      codePanel: true,
      source: {
        language: 'tsx'
      }
    }
  }
} satisfies Meta

export const Transmittance = createStory(Story2D, {
  props: {
    name: 'transmittance'
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

export const Irradiance = createStory(Story2D, {
  props: {
    name: 'irradiance'
  },
  args: {
    zoom: 16,
    toneMappingExposure: 100
  },
  parameters: {
    docs: {
      source: {
        code: Code2D
      }
    }
  }
})

export const Scattering = createStory(Story3D, {
  props: {
    name: 'scattering'
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  },
  parameters: {
    docs: {
      source: {
        code: Code3D
      }
    }
  }
})

export const SingleMieScattering = createStory(Story3D, {
  props: {
    name: 'singleMieScattering',
    combinedScatteringTextures: false
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  },
  parameters: {
    docs: {
      source: {
        code: Code3D
      }
    }
  }
})

export const HigherOrderScattering = createStory(Story3D, {
  props: {
    name: 'higherOrderScattering'
  },
  args: {
    zoom: 2,
    toneMappingExposure: 0.5
  },
  parameters: {
    docs: {
      source: {
        code: Code3D
      }
    }
  }
})
