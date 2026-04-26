import {
  Plane,
  Vector3,
  type DirectionalLight,
  type PerspectiveCamera,
  type Vector2
} from 'three'
import { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import type { NodeFrame } from 'three/webgpu'

declare module 'three/examples/jsm/csm/CSMShadowNode.js' {
  interface CSMShadowNode {
    _cascades: Vector2[]
  }
}

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const planeScratch = /*#__PURE__*/ new Plane()

export class CascadedShadowMapsNode extends CSMShadowNode {
  // Fixes wrong types
  declare camera: PerspectiveCamera
  declare light: DirectionalLight

  override updateBefore(frame: NodeFrame): void {
    super.updateBefore(frame)

    const { lights } = this
    if (lights.length < 2) {
      return
    }

    // Align near planes with that of the largest frustum's light.
    const lastLight = lights[lights.length - 1]
    const lightDirection = vectorScratch1
      .subVectors(lastLight.target.position, lastLight.position)
      .normalize()
    const nearPlane = planeScratch.setFromNormalAndCoplanarPoint(
      lightDirection,
      lastLight.position
    )
    for (let i = 0; i < lights.length - 1; ++i) {
      const light = lights[i]
      nearPlane.projectPoint(light.position, light.position)
      light.target.position.copy(light.position).add(lightDirection)
    }
  }
}
