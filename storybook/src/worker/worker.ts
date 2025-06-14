/* eslint-env worker */

import workerpool from 'workerpool'

import { toCreasedNormals } from './tasks/toCreasedNormals'

export const methods = { toCreasedNormals }

workerpool.worker(methods)
