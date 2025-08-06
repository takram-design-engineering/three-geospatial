import { Matrix3 } from 'three'
import { DirectionalLight } from 'three/webgpu'

import { nodeType } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'

const rotationScratch = new Matrix3()

// WORKAROUND: As of r178, LightShadow and DirectionalLightShadow are not
// exported but their types only, so we extend DirectionalLight to create an
// instance of LightShadow.
export class AtmosphereLight extends DirectionalLight {
  override readonly type = 'DirectionalLight'

  renderingContext?: AtmosphereRenderingContext
  lutNode?: AtmosphereLUTNode

  @nodeType('int')
  direct = true

  @nodeType('int')
  indirect = true

  // Distance to the target position.
  distance: number

  constructor(
    renderingContext?: AtmosphereRenderingContext,
    lutNode?: AtmosphereLUTNode,
    distance = 1
  ) {
    super()
    this.renderingContext = renderingContext
    this.lutNode = lutNode
    this.distance = distance
  }

  override updateMatrixWorld(force?: boolean): void {
    // WORKAROUND: Because we can't extend LightShadow, hook the render updates
    // in updateMatrixWorld, which will be called in every frame.
    this.updatePosition()
    super.updateMatrixWorld(force)
  }

  private updatePosition(): void {
    const { renderingContext } = this
    if (renderingContext == null) {
      return
    }
    const { ecefToWorldMatrix, sunDirectionECEF } = renderingContext.getUniforms()
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
    // Copy by reference here:
    this.renderingContext = source.renderingContext
    this.lutNode = source.lutNode
    return this
  }
}
