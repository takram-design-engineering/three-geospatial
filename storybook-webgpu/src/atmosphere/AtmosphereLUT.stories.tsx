import type { Meta } from '@storybook/react-vite'

import { createStory } from '../helpers/createStory'

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

export const Transmittance = createStory(
  (await import('./AtmosphereLUT-2D')).Story,
  {
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
          code: (await import('./AtmosphereLUT-2D?raw')).default
        }
      }
    }
  }
)

export const Irradiance = createStory(
  (await import('./AtmosphereLUT-2D')).Story,
  {
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
          code: (await import('./AtmosphereLUT-2D?raw')).default
        }
      }
    }
  }
)

export const Scattering = createStory(
  (await import('./AtmosphereLUT-3D')).Story,
  {
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
          code: (await import('./AtmosphereLUT-3D?raw')).default
        }
      }
    }
  }
)

export const SingleMieScattering = createStory(
  (await import('./AtmosphereLUT-3D')).Story,
  {
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
          code: (await import('./AtmosphereLUT-3D?raw')).default
        }
      }
    }
  }
)

export const HigherOrderScattering = createStory(
  (await import('./AtmosphereLUT-3D')).Story,
  {
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
          code: (await import('./AtmosphereLUT-3D?raw')).default
        }
      }
    }
  }
)
