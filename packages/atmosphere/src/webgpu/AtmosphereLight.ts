import { Matrix3 } from 'three'
import { DirectionalLight } from 'three/webgpu'

import { referenceNode, type NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereContext } from './AtmosphereContext'

const rotationScratch = new Matrix3()

// WORKAROUND: As of r178, LightShadow and DirectionalLightShadow are not
// exported but their types only, so we extend DirectionalLight to create an
// instance of LightShadow.
export class AtmosphereLight extends DirectionalLight {
  override readonly type = 'DirectionalLight'

  atmosphereContext?: AtmosphereContext

  direct = true
  indirect = true

  @referenceNode('float') directNode!: NodeObject
  @referenceNode('float') indirectNode!: NodeObject

  // Distance to the target position.
  distance: number

  constructor(atmosphereContext?: AtmosphereContext, distance = 1) {
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
    const { atmosphereContext: context } = this
    if (context == null) {
      return
    }
    const { ecefToWorldMatrix, sunDirectionECEF } = context.getNodes()
    this.position
      .copy(sunDirectionECEF.value)
      .applyMatrix3(rotationScratch.setFromMatrix4(ecefToWorldMatrix.value))
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
