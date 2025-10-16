import { DirectionalLight, Matrix3 } from 'three'
import { uniform } from 'three/tsl'

import type { AtmosphereContextNode } from './AtmosphereContextNode'

const rotationScratch = new Matrix3()

// WORKAROUND: As of r178, LightShadow and DirectionalLightShadow are not
// exported but their types only, so we extend DirectionalLight to create an
// instance of LightShadow.
export class AtmosphereLight extends DirectionalLight {
  override readonly type = 'AtmosphereLight'

  atmosphereContext?: AtmosphereContextNode

  // Distance to the target position.
  distance: number

  direct = uniform(true)
  indirect = uniform(true)

  constructor(atmosphereContext?: AtmosphereContextNode, distance = 1) {
    super()
    this.atmosphereContext = atmosphereContext
    this.distance = distance
  }

  override updateMatrixWorld(force?: boolean): void {
    // WORKAROUND: Because we can't extend LightShadow, hook the render updates
    // in updateMatrixWorld, which will be called in every frame.
    this.updatePosition()
    super.updateMatrixWorld(force)
  }

  private updatePosition(): void {
    if (this.atmosphereContext == null) {
      return
    }
    const { matrixECEFToWorld, sunDirectionECEF } = this.atmosphereContext
    this.position
      .copy(sunDirectionECEF.value)
      .applyMatrix3(rotationScratch.setFromMatrix4(matrixECEFToWorld.value))
      .multiplyScalar(this.distance)
      .add(this.target.position)

    // WORKAROUND: This won't be needed if we extend LightShadow.
    super.updateWorldMatrix(true, false)
    this.target.updateWorldMatrix(true, false)
  }

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive)
    this.atmosphereContext = source.atmosphereContext // Copy by reference here
    return this
  }
}
