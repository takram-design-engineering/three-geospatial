/* eslint-env worker */

import workerpool from 'workerpool'

import { createTerrainGeometry } from './tasks/createTerrainGeometry'
import { toCreasedNormals } from './tasks/toCreasedNormals'

export const methods = {
  toCreasedNormals,
  createTerrainGeometry
}

workerpool.worker(methods)
