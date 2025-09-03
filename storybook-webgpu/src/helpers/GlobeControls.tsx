import {
  GlobeControls as GlobeControlsBase,
  type GlobeControlsProps
} from '3d-tiles-renderer/r3f'
import type { GlobeControls as GlobeControlsImpl } from '3d-tiles-renderer/three'
import type { FC, ForwardedRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Material, Mesh, Object3D, Scene } from 'three'
import {
  cameraProjectionMatrix,
  Fn,
  fwidth,
  modelViewMatrix,
  nodeImmutable,
  positionGeometry,
  screenSize,
  smoothstep,
  uniform,
  uv,
  vec4
} from 'three/tsl'
import { NodeMaterial, ScreenNode, type UniformNode } from 'three/webgpu'

import { assertType } from '@takram/three-geospatial'
import type { NodeObject } from '@takram/three-geospatial/webgpu'

// BUG: screenDPR is not exported from 'three/tsl'
const screenDPR = /*#__PURE__*/ nodeImmutable(ScreenNode, 'dpr' as any)

interface PivotUniforms {
  size: NodeObject<UniformNode<number>>
  thickness: NodeObject<UniformNode<number>>
  opacity: NodeObject<UniformNode<number>>
}

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

function createSceneProxy(
  scene: Object3D,
  overlayScene: Object3D,
  overlayObjects: readonly Object3D[]
): Object3D {
  return new Proxy(scene, {
    get(target, property, receiver) {
      if (property === 'add') {
        return (...objects: Object3D[]) => {
          for (const object of objects) {
            if (overlayObjects.includes(object)) {
              overlayScene.add(object)
            } else {
              Reflect.get(target, property, receiver)(object)
            }
          }
        }
      }
      return Reflect.get(target, property, receiver)
    }
  })
}

const initControls =
  (overlayScene?: Scene) =>
  (controls: GlobeControlsImpl): void => {
    assertType<
      GlobeControlsImpl & {
        pivotMesh: Mesh
      }
    >(controls)

    // Replace the pivot mesh:
    const pivotMesh = Object.assign(controls.pivotMesh, {
      size: uniform(15),
      thickness: uniform(2),
      opacity: uniform(0.5)
    })
    ;(pivotMesh.material as Material).dispose()
    pivotMesh.material = createPivotMaterial(pivotMesh)
    pivotMesh.onBeforeRender = () => {}

    // Add a hook to reroute the pivot mesh to another scene:
    if (overlayScene != null) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setScene = controls.setScene
      controls.setScene = scene => {
        if (scene != null) {
          scene = createSceneProxy(scene, overlayScene, [pivotMesh])
        }
        setScene.apply(controls, [scene])
      }
    }
  }

export const GlobeControls: FC<
  GlobeControlsProps & {
    ref?: ForwardedRef<GlobeControlsImpl>
    overlayScene?: Scene
  }
> = ({ overlayScene, ...props }) => (
  <GlobeControlsBase
    ref={mergeRefs([props.ref, initControls(overlayScene)])}
    {...props}
  />
)
