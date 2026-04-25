import { depth, Fn } from 'three/tsl'

import { depthToViewZ } from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'

export const viewZUnit = Fn(builder => {
  const { parametersNode } = getAtmosphereContext(builder)
  const { worldToUnit } = parametersNode
  return depthToViewZ(depth, builder.camera).mul(worldToUnit)
})
  .once()()
  .toVar('viewZUnit')
