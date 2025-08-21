import type { Unary } from 'three/src/nodes/TSL.js'
import { addMethodChaining } from 'three/tsl'

import type { NodeObject } from './node'

declare module 'three/src/nodes/tsl/TSLCore.js' {
  interface NodeElements {
    sq: Unary
  }
}

// On Windows Chrome, x.pow2() and x.mul(x) produce very different results.
// See: https://x.com/shotamatsuda/status/1958658985349062812
export const sq = (x: NodeObject): NodeObject => x.mul(x)

addMethodChaining('sq', sq)
