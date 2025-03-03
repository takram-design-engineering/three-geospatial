import { type OverwriteMathProps } from '@takram/three-geospatial/r3f'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'

export function separateProps<
  T extends OverwriteMathProps<AtmosphereMaterialProps>
>(
  params: T
): [
  OverwriteMathProps<AtmosphereMaterialProps>,
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
