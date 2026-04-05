import { DirectionalLight } from 'three'
import { uniform } from 'three/tsl'

export type AtmosphereLightBody = 'sun' | 'moon'

export class AtmosphereLight extends DirectionalLight {
  override readonly type = 'AtmosphereLight'

  distance: number // Distance to the target position.
  body: AtmosphereLightBody

  direct = uniform(true)
  indirect = uniform(true)

  constructor(distance = 1, body: AtmosphereLightBody = 'sun') {
    super()
    this.distance = distance
    this.body = body
  }
}
