import { type ExtendedProps } from '@takram/three-geospatial/r3f'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'

export function separateProps<T extends ExtendedProps<AtmosphereMaterialProps>>(
  params: T
): [
  ExtendedProps<AtmosphereMaterialProps>,
  Omit<T, keyof AtmosphereMaterialProps>
] {
  const {
    irradianceTexture,
    scatteringTexture,
    transmittanceTexture,
    useHalfFloat,
    ellipsoid,
    correctAltitude,
    photometric,
    sunDirection,
    sunAngularRadius,
    renderTargetCount,
    ...others
  } = params
  return [
    {
      irradianceTexture,
      scatteringTexture,
      transmittanceTexture,
      useHalfFloat,
      ellipsoid,
      correctAltitude,
      photometric,
      sunDirection,
      sunAngularRadius,
      renderTargetCount
    },
    others
  ]
}
