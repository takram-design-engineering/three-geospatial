/* eslint-env worker */

import workerpool from 'workerpool'

import { toCreasedNormalsWorker } from './toCreasedNormalsWorker'

workerpool.worker({
  toCreasedNormals: toCreasedNormalsWorker
})
