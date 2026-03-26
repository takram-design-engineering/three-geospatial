import { DirectionalLight } from 'three'
import { uniform } from 'three/tsl'

// WORKAROUND: As of r178, LightShadow and DirectionalLightShadow are not
// exported but their types only, so we extend DirectionalLight to create an
// instance of LightShadow.
export class AtmosphereLight extends DirectionalLight {
  override readonly type = 'AtmosphereLight'

  // Distance to the target position.
  distance: number

  direct = uniform(true)
  indirect = uniform(true)

  constructor(distance = 1) {
    super()
    this.distance = distance
  }
}
