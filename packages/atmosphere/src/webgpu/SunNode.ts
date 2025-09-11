import {
  cos,
  Fn,
  fwidth,
  If,
  nodeObject,
  smoothstep,
  uniform,
  vec3
} from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import type { Node, NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereContextNode } from './AtmosphereContextNode'
import { getSolarLuminance } from './runtime'

export class SunNode extends TempNode {
  static override get type(): string {
    return 'SunNode'
  }

  private readonly atmosphereContext: AtmosphereContextNode

  rayDirectionECEF?: Node

  angularRadius = uniform(0.004675) // ≈ 16 arcminutes
  intensity = uniform(1)

  constructor(atmosphereContext: AtmosphereContextNode) {
    super('vec3')
    this.atmosphereContext = atmosphereContext
  }

  override setup(builder: NodeBuilder): unknown {
    builder.getContext().atmosphere = this.atmosphereContext

    if (this.rayDirectionECEF == null) {
      return
    }
    const rayDirectionECEF = nodeObject(this.rayDirectionECEF)
    const { sunDirectionECEF } = this.atmosphereContext.getNodes()

    return Fn(() => {
      const chordThreshold = cos(this.angularRadius).oneMinus().mul(2)
      const chordVector = rayDirectionECEF.sub(sunDirectionECEF)
      const chordLength = chordVector.dot(chordVector)
      const filterWidth = fwidth(chordLength)

      const luminance = vec3(0).toVar()
      If(chordLength.lessThan(chordThreshold), () => {
        const antialias = smoothstep(
          chordThreshold,
          chordThreshold.sub(filterWidth),
          chordLength
        )
        luminance.assign(getSolarLuminance().mul(this.intensity).mul(antialias))
      })
      return luminance
    })()
  }
}

export const sun = (
  ...args: ConstructorParameters<typeof SunNode>
): NodeObject<SunNode> => nodeObject(new SunNode(...args))
