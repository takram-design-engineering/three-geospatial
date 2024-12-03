import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'

export function separateProps<T extends AtmosphereMaterialProps>(
  params: T
): [AtmosphereMaterialProps, Omit<T, keyof AtmosphereMaterialProps>] {
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
