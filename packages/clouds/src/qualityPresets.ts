import { Vector2 } from 'three'
import { type PartialDeep } from 'type-fest'

import { type CloudsEffect } from './CloudsEffect'

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra'

export const qualityPresets: Record<
  QualityPreset,
  PartialDeep<CloudsEffect>
> = {
  // TODO: We cloud decrease multi-scattering octaves for lower quality presets,
  // but it leads to a loss of higher frequency scattering, making it darker
  // overall, which suggests the need for a fudge factor to scale the radiance.
  low: {
    resolutionScale: 0.75, // Obvious, but 0.5 is excessive.
    lightShafts: false, // Expensive
    shapeDetail: false, // Expensive
    turbulence: false, // Expensive
    groundIrradianceScale: 0, // Turns off the march to the ground.
    clouds: {
      maxIterationCount: 200,
      minStepSize: 100,
      maxRayDistance: 1e5,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      minTransmittance: 1e-1, // Makes the primary march terminate earlier.
      accurateSunSkyIrradiance: false, // Greatly reduces texel reads.
      maxIterationCountToSun: 0 // Use only BSM for the optical depth.
    },
    shadow: {
      maxIterationCount: 25,
      minDensity: 1e-4,
      minExtinction: 1e-4,
      minTransmittance: 1e-2, // Makes the primary march terminate earlier.
      cascadeCount: 2, // Obvious
      mapSize: /*#__PURE__*/ new Vector2(256, 256) // Obvious
    }
  },
  medium: {
    lightShafts: false, // Expensive
    turbulence: false, // Expensive
    clouds: {
      minDensity: 1e-4,
      minExtinction: 1e-4,
      accurateSunSkyIrradiance: false,
      maxIterationCountToSun: 2,
      maxIterationCountToGround: 1
    },
    shadow: {
      minDensity: 1e-4,
      minExtinction: 1e-4,
      mapSize: /*#__PURE__*/ new Vector2(256, 256)
    }
  },
  high: {}, // Consider the default settings as high quality.
  ultra: {
    shadow: {
      maxIterationCount: 100,
      mapSize: /*#__PURE__*/ new Vector2(1024, 1024)
    }
  }
}
