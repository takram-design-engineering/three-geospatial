/* eslint-env worker */

import workerpool from 'workerpool'

import { toCreasedNormalsTask } from './tasks/toCreasedNormalsTask'

export const methods = {
  toCreasedNormals: toCreasedNormalsTask
}

workerpool.worker(methods)
