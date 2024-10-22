import { omit, pick } from 'lodash'

import { type AtmosphereMaterialProps } from '../AtmosphereMaterialBase'

const propKeys = [
  'useHalfFloat',
  'ellipsoid',
  'osculateEllipsoid',
  'photometric',
  'sunDirection',
  'sunAngularRadius'
] as const satisfies ReadonlyArray<keyof AtmosphereMaterialProps>

export function separateProps<T extends AtmosphereMaterialProps>(
  params: T
): [AtmosphereMaterialProps, Omit<T, keyof AtmosphereMaterialProps>] {
  return [pick(params, propKeys), omit(params, propKeys)]
}