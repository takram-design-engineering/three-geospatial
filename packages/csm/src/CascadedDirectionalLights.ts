import {
  DirectionalLight,
  Object3D,
  Vector3,
  type ColorRepresentation
} from 'three'

export class CascadedDirectionalLights extends Object3D {
  readonly mainLight: DirectionalLight
  readonly cascadedLights: DirectionalLight[]

  // For convenience and stability of the values, because CascadedShadowMaps
  // modifies the positions of lights and their targets.
  // i.e. position.copy(direction).multiplyScalar(-1).add(target.position)
  direction = new Vector3(-1, -1, -1)

  constructor(color?: ColorRepresentation, intensity?: number) {
    super()
    const light = new DirectionalLight(color, intensity)
    light.castShadow = true
    this.mainLight = light
    this.cascadedLights = [light]
    this.add(light)
    this.add(light.target)
  }

  setCount(value: number): this {
    value = Math.max(1, value)
    const count = this.cascadedLights.length
    if (value === count) {
      return this
    }
    if (value > count) {
      const mainLight = this.mainLight
      for (let i = count; i < value; ++i) {
        const light = mainLight.clone() // Clones the shadow parameters as well.
        this.add(light)
        this.add(light.target)
        this.cascadedLights[i] = light
      }
    } else {
      for (let i = value; i < count; ++i) {
        const light = this.cascadedLights[i]
        light.dispose()
        this.remove(light.target)
        this.remove(light)
      }
    }
    this.cascadedLights.length = value
    return this
  }

  dispose(): void {
    for (let i = 0; i < this.cascadedLights.length; ++i) {
      this.cascadedLights[i].dispose()
    }
  }
}
