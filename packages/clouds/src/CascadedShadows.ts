// Based on the following work with slight modifications.
// https://github.com/StrandedKitty/three-csm/
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

/**
 * MIT License
 *
 * Copyright (c) 2019 vtHawk
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {
  Box3,
  Matrix4,
  Object3D,
  Vector2,
  Vector3,
  type PerspectiveCamera
} from 'three'
import invariant from 'tiny-invariant'

import { Ellipsoid, lerp } from '@takram/three-geospatial'

import { FrustumCorners } from './helpers/FrustumCorners'
import { splitFrustum, type FrustumSplitMode } from './helpers/splitFrustum'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()
const frustumScratch = /*#__PURE__*/ new FrustumCorners()
const boxScratch = /*#__PURE__*/ new Box3()

export interface CascadedShadowsOptions {
  cascadeCount?: number
  far?: number
  mode?: FrustumSplitMode
  lambda?: number
  margin?: number
  fade?: boolean
}

export const cascadedShadowsOptionsDefaults = {
  cascadeCount: 4,
  far: 1e4,
  mode: 'practical',
  lambda: 0.5,
  margin: 0,
  fade: true
} satisfies Partial<CascadedShadowsOptions>

interface Light {
  readonly projectionMatrix: Matrix4
  readonly inverseViewMatrix: Matrix4
}

export class CascadedShadows {
  readonly lights: Light[] = []
  readonly cascadeMatrix = new Matrix4()

  far: number
  mode: FrustumSplitMode
  lambda: number
  margin: number
  fade: boolean

  private readonly cascadedFrusta: FrustumCorners[] = []
  private readonly splits: number[] = []
  readonly cascades: Vector2[] = []

  constructor(options?: CascadedShadowsOptions) {
    const { cascadeCount, far, mode, lambda, margin, fade } = {
      ...cascadedShadowsOptionsDefaults,
      ...options
    }
    this.cascadeCount = cascadeCount
    this.far = far
    this.mode = mode
    this.lambda = lambda
    this.margin = margin
    this.fade = fade
  }

  get cascadeCount(): number {
    return this.lights.length
  }

  set cascadeCount(value: number) {
    if (value !== this.cascadeCount) {
      for (let i = 0; i < value; ++i) {
        this.lights[i] = {
          projectionMatrix: new Matrix4(),
          inverseViewMatrix: new Matrix4()
        }
      }
      this.lights.length = value
    }
  }

  private updateCascades(camera: PerspectiveCamera): void {
    const cascadeCount = this.cascadeCount
    const splits = this.splits
    const far = Math.min(this.far, camera.far)
    splitFrustum(this.mode, cascadeCount, camera.near, far, this.lambda, splits)
    frustumScratch.setFromCamera(camera, far)
    frustumScratch.split(splits, this.cascadedFrusta)

    const cascades = this.cascades
    for (let i = 0; i < cascadeCount; ++i) {
      const vector = cascades[i] ?? (cascades[i] = new Vector2())
      vector.set(splits[i - 1] ?? 0, splits[i] ?? 0)
    }
    cascades.length = cascadeCount
  }

  // TODO: BSM doesn't need rotational invariance. Frusta can be tighter.
  private getFrustumRadius(
    camera: PerspectiveCamera,
    frustum: FrustumCorners
  ): number {
    // Get the two points that represent that furthest points on the frustum
    // assuming that's either the diagonal across the far plane or the diagonal
    // across the whole frustum itself.
    const nearCorners = frustum.near
    const farCorners = frustum.far
    let diagonalLength = Math.max(
      farCorners[0].distanceTo(farCorners[2]),
      farCorners[0].distanceTo(nearCorners[2])
    )

    // Expand the shadow bounds by the fade width.
    if (this.fade) {
      const near = camera.near
      const far = Math.min(this.far, camera.far)
      const distance = farCorners[0].z / (far - near)
      diagonalLength += 0.25 * distance ** 2 * (far - near)
    }
    return diagonalLength * 0.5
  }

  update(
    camera: PerspectiveCamera,
    sunDirection: Vector3,
    ellipsoid = Ellipsoid.WGS84
  ): void {
    this.updateCascades(camera)

    const lightOrientationMatrix = matrixScratch1.lookAt(
      vectorScratch1.set(0, 0, 0),
      vectorScratch2.copy(sunDirection).multiplyScalar(-1),
      Object3D.DEFAULT_UP
    )
    const cameraToLightMatrix = matrixScratch2.multiplyMatrices(
      matrixScratch2.copy(lightOrientationMatrix).invert(),
      camera.matrixWorld
    )

    // Increase light's distance to the target when the sun is at the horizon.
    const cameraPosition = camera.getWorldPosition(vectorScratch1)
    const up = ellipsoid.getSurfaceNormal(cameraPosition, vectorScratch2)
    const zenithAngle = sunDirection.dot(up)
    const distance = lerp(1e6, 1e3, zenithAngle)

    const margin = this.margin
    const frusta = this.cascadedFrusta
    const lights = this.lights
    invariant(frusta.length === lights.length)

    for (let i = 0; i < frusta.length; ++i) {
      const frustum = frusta[i]
      const light = lights[i]

      const { near, far } = frustumScratch
        .copy(frustum)
        .applyMatrix4(cameraToLightMatrix)
      const bbox = boxScratch.makeEmpty()
      for (let j = 0; j < 4; j++) {
        bbox.expandByPoint(near[j])
        bbox.expandByPoint(far[j])
      }
      const center = bbox.getCenter(vectorScratch1)
      center.z = bbox.max.z + margin
      center.applyMatrix4(lightOrientationMatrix)

      const radius = this.getFrustumRadius(camera, frustum)
      light.projectionMatrix.makeOrthographic(
        -radius, // left
        radius, // right
        radius, // top
        -radius, // bottom
        -this.margin, // near
        radius * 2 + this.margin // far
      )

      const position = vectorScratch2
        .copy(sunDirection)
        .multiplyScalar(distance)
        .add(center)
      light.inverseViewMatrix
        .lookAt(center, position, Object3D.DEFAULT_UP)
        .setPosition(position)
    }
  }
}
