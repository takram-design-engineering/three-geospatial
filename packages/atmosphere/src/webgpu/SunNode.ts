import { cos, Fn, fwidth, If, smoothstep, uniform, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import type { Node } from '@takram/three-geospatial/webgpu'

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
    super('vec4')
    this.atmosphereContext = atmosphereContext
  }

  override setup(builder: NodeBuilder): unknown {
    builder.getContext().atmosphere = this.atmosphereContext

    const { rayDirectionECEF } = this
    if (rayDirectionECEF == null) {
      return
    }
    const { sunDirectionECEF } = this.atmosphereContext

    return Fn(() => {
      const chordThreshold = cos(this.angularRadius).oneMinus().mul(2)
      const chordVector = rayDirectionECEF.sub(sunDirectionECEF)
      const chordLength = chordVector.dot(chordVector)
      const filterWidth = fwidth(chordLength)

      const luminance = vec4(0).toVar()
      If(chordLength.lessThan(chordThreshold), () => {
        const antialias = smoothstep(
          chordThreshold,
          chordThreshold.sub(filterWidth),
          chordLength
        )
        luminance.assign(
          vec4(getSolarLuminance().mul(this.intensity), antialias)
        )
      })
      return luminance
    })()
  }
}
