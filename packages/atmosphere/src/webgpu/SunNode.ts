import { cos, Fn, fwidth, If, smoothstep, uniform, vec4 } from 'three/tsl'
import { TempNode, type Node, type NodeBuilder } from 'three/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import { getSolarLuminance } from './runtime'

export class SunNode extends TempNode {
  static get type(): string {
    return 'SunNode'
  }

  rayDirectionECEF?: Node<'vec3'>

  angularRadius = uniform(0.004675) // ≈ 16 arcminutes
  intensity = uniform(1)

  constructor() {
    super('vec4')
  }

  override setup(builder: NodeBuilder): Node<'vec4'> | undefined {
    const atmosphereContext = getAtmosphereContext(builder)

    const { rayDirectionECEF } = this
    if (rayDirectionECEF == null) {
      return
    }
    const { sunDirectionECEF } = atmosphereContext

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
