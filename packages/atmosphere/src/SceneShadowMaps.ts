import {
  DirectionalLight,
  Matrix4,
  Object3D,
  Vector2,
  type Camera,
  type Scene,
  type Texture,
  type Vector3
} from 'three'
import invariant from 'tiny-invariant'

import { CascadedShadow } from '@takram/three-geospatial'

import type { AtmosphereSceneShadow } from './types'

const matrixScratch = /*#__PURE__*/ new Matrix4()

export class SceneShadowMaps
  extends CascadedShadow
  implements AtmosphereSceneShadow
{
  lights: DirectionalLight[] = []

  // Implementation of scene shadow interface.
  maps: Array<Texture | null> = []
  intervals = Array.from({ length: 4 }, () => new Vector2())
  matrices = Array.from({ length: 4 }, () => new Matrix4())
  inverseMatrices = Array.from({ length: 4 }, () => new Matrix4())

  update(scene: Scene, camera: Camera, sunDirection: Vector3): void {
    this.updateCascades(camera, sunDirection)
    const cascadeCount = this.cascadeCount

    const lights = this.lights
    while (lights.length > cascadeCount) {
      const light = lights.pop()
      invariant(light != null)
      scene.remove(light)
      scene.remove(light.target)
      light.dispose()
    }
    while (lights.length < cascadeCount) {
      // Lights are provided just for giving access to the WebGLShadowMap and
      // must not have any effect on the scene.
      const light = new DirectionalLight(undefined, 0)
      light.castShadow = true
      scene.add(light)
      scene.add(light.target)
      lights.push(light)
    }

    const { cascades, maps, intervals, matrices } = this
    for (let i = 0; i < cascadeCount; ++i) {
      const light = lights[i]
      const cascade = cascades[i]
      const { lightPosition, lightTarget, projectionParams } = cascade

      light.position.copy(lightPosition)
      light.target.position.copy(lightTarget)

      const lightShadow = light.shadow
      light.shadow.mapSize.copy(this.mapSize)

      const shadowCamera = lightShadow.camera
      shadowCamera.left = projectionParams.left
      shadowCamera.right = projectionParams.right
      shadowCamera.top = projectionParams.top
      shadowCamera.bottom = projectionParams.bottom
      shadowCamera.near = projectionParams.near
      shadowCamera.far = projectionParams.far
      shadowCamera.updateProjectionMatrix()

      maps[i] = lightShadow.map?.texture ?? null
      intervals[i].copy(cascade.interval)
      matrices[i]
        .copy(cascade.projectionMatrix)
        .multiply(
          matrixScratch
            .lookAt(lightPosition, lightTarget, Object3D.DEFAULT_UP)
            .setPosition(lightPosition)
            .invert()
        )
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      light.dispose()
    }
  }
}
