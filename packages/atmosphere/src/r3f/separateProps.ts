import { omit, pick } from 'lodash-es'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'

const propKeys = [
  'irradianceTexture',
  'scatteringTexture',
  'transmittanceTexture',
  'useHalfFloat',
  'ellipsoid',
  'correctAltitude',
  'photometric',
  'sunDirection',
  'sunAngularRadius',
  'renderTargetCount'
] as const satisfies ReadonlyArray<keyof AtmosphereMaterialProps>

export function separateProps<T extends AtmosphereMaterialProps>(
  params: T
): [AtmosphereMaterialProps, Omit<T, keyof AtmosphereMaterialProps>] {
  return [pick(params, propKeys), omit(params, propKeys)]
}
