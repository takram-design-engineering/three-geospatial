import { GlobeControls as GlobeControlsBase } from '3d-tiles-renderer'
import type { Material, Mesh } from 'three'
import {
  cameraProjectionMatrix,
  Fn,
  fwidth,
  modelViewMatrix,
  positionGeometry,
  screenDPR,
  screenSize,
  smoothstep,
  uniform,
  uv,
  vec4
} from 'three/tsl'
import { NodeMaterial, type UniformNode } from 'three/webgpu'

interface PivotUniforms {
  size: UniformNode<number>
  thickness: UniformNode<number>
  opacity: UniformNode<number>
}

// Ported from: https://github.com/NASA-AMMOS/3DTilesRendererJS/blob/v0.4.17/src/three/renderer/controls/PivotPointMesh.js
function createPivotMaterial(uniforms: PivotUniforms): Material {
  const size = uniforms.size.mul(screenDPR)
  const thickness = uniforms.thickness.mul(screenDPR)
  const opacity = uniforms.opacity

  const material = new NodeMaterial()
  material.depthWrite = false
  material.depthTest = false
  material.transparent = true

  material.vertexNode = Fn(() => {
    const aspect = screenSize.x.div(screenSize.y)
    const offset = uv().mul(2).sub(1)
    offset.y.mulAssign(aspect)

    const screenPoint = cameraProjectionMatrix
      .mul(modelViewMatrix)
      .mul(vec4(positionGeometry, 1))
    screenPoint.xy.addAssign(
      offset.mul(size.add(thickness)).mul(screenPoint.w).div(screenSize.x)
    )
    return screenPoint
  })()

  material.outputNode = Fn(() => {
    const ht = thickness.mul(0.5)
    const planeDim = size.add(thickness)
    const offset = planeDim.sub(ht).sub(2).div(planeDim)
    const texelThickness = ht.div(planeDim)
    const vec = uv().mul(2).sub(1)
    const dist = vec.length().sub(offset).abs()
    const fw = fwidth(dist).mul(0.5)
    const a = smoothstep(texelThickness.sub(fw), texelThickness.add(fw), dist)
    return vec4(1, 1, 1, opacity.mul(a.oneMinus()))
  })()

  return material
}

export function modifyPivotMesh(originalPivotMesh: Mesh): Mesh {
  // HACK: Replace the pivot mesh:
  const pivotMesh = Object.assign(originalPivotMesh, {
    size: uniform(15),
    thickness: uniform(2),
    opacity: uniform(0.5)
  })
  const originalMaterial = pivotMesh.material as Material
  originalMaterial.dispose()
  pivotMesh.material = createPivotMaterial(pivotMesh)
  pivotMesh.onBeforeRender = () => {}

  return pivotMesh
}

export class GlobeControls extends GlobeControlsBase {
  declare readonly pivotMesh: Mesh

  constructor(...args: ConstructorParameters<typeof GlobeControlsBase>) {
    super(...args)
    modifyPivotMesh(this.pivotMesh)
  }
}
