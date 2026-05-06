import { Fn, positionView } from 'three/tsl'

import { getAtmosphereContext } from './AtmosphereContext'

export const viewZUnit = Fn(builder => {
  const { parametersNode } = getAtmosphereContext(builder)
  const { worldToUnit } = parametersNode
  return positionView.z.mul(worldToUnit)
})
  .once()()
  .toVar('viewZUnit')
