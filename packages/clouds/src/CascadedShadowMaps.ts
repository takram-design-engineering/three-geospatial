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

import { FrustumCorners } from './helpers/FrustumCorners'
import { splitFrustum, type FrustumSplitMode } from './helpers/splitFrustum'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()
const frustumScratch = /*#__PURE__*/ new FrustumCorners()
const boxScratch = /*#__PURE__*/ new Box3()

export interface Cascade {
  readonly interval: Vector2
  readonly matrix: Matrix4
  readonly inverseMatrix: Matrix4
  readonly projectionMatrix: Matrix4
  readonly inverseProjectionMatrix: Matrix4
  readonly viewMatrix: Matrix4
  readonly inverseViewMatrix: Matrix4
}

export interface CascadedShadowMapsOptions {
  cascadeCount: number
  mapSize: Vector2
  maxFar?: number | null
  farScale?: number
  splitMode?: FrustumSplitMode
  splitLambda?: number
  margin?: number
  fade?: boolean
}

export const cascadedShadowMapsDefaults = {
  maxFar: null,
  farScale: 1,
  splitMode: 'practical',
  splitLambda: 0.5,
  margin: 0,
  fade: true
} satisfies Partial<CascadedShadowMapsOptions>

export class CascadedShadowMaps {
  readonly cascades: Cascade[] = []

  readonly mapSize = new Vector2()
  maxFar: number | null
  farScale: number
  splitMode: FrustumSplitMode
  splitLambda: number
  margin: number
  fade: boolean

  private readonly cameraFrustum = new FrustumCorners()
  private readonly frusta: FrustumCorners[] = []
  private readonly splits: number[] = []
  private _far = 0

  constructor(options: CascadedShadowMapsOptions) {
    const {
      cascadeCount,
      mapSize,
      maxFar,
      farScale,
      splitMode,
      splitLambda,
      margin,
      fade
    } = {
      ...cascadedShadowMapsDefaults,
      ...options
    }
    this.cascadeCount = cascadeCount
    this.mapSize.copy(mapSize)
    this.maxFar = maxFar
    this.farScale = farScale
    this.splitMode = splitMode
    this.splitLambda = splitLambda
    this.margin = margin
    this.fade = fade
  }

  get cascadeCount(): number {
    return this.cascades.length
  }

  set cascadeCount(value: number) {
    if (value !== this.cascadeCount) {
      for (let i = 0; i < value; ++i) {
        this.cascades[i] ??= {
          interval: new Vector2(),
          matrix: new Matrix4(),
          inverseMatrix: new Matrix4(),
          projectionMatrix: new Matrix4(),
          inverseProjectionMatrix: new Matrix4(),
          viewMatrix: new Matrix4(),
          inverseViewMatrix: new Matrix4()
        }
      }
      this.cascades.length = value
    }
  }

  get far(): number {
    return this._far
  }

  private updateIntervals(camera: PerspectiveCamera): void {
    const cascadeCount = this.cascadeCount
    const splits = this.splits
    const far = this.far
    splitFrustum(
      this.splitMode,
      cascadeCount,
      camera.near,
      far,
      this.splitLambda,
      splits
    )
    this.cameraFrustum.setFromCamera(camera, far)
    this.cameraFrustum.split(splits, this.frusta)

    const cascades = this.cascades
    for (let i = 0; i < cascadeCount; ++i) {
      cascades[i].interval.set(splits[i - 1] ?? 0, splits[i] ?? 0)
    }
  }

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
      const far = this.far
      const distance = farCorners[0].z / (far - near)
      diagonalLength += 0.25 * distance ** 2 * (far - near)
    }
    return diagonalLength * 0.5
  }

  private updateMatrices(
    camera: PerspectiveCamera,
    sunDirection: Vector3,
    distance = 1
  ): void {
    const lightOrientationMatrix = matrixScratch1.lookAt(
      vectorScratch1.setScalar(0),
      vectorScratch2.copy(sunDirection).multiplyScalar(-1),
      Object3D.DEFAULT_UP
    )
    const cameraToLightMatrix = matrixScratch2.multiplyMatrices(
      matrixScratch2.copy(lightOrientationMatrix).invert(),
      camera.matrixWorld
    )

    const frusta = this.frusta
    const cascades = this.cascades
    invariant(frusta.length === cascades.length)
    const margin = this.margin
    const mapSize = this.mapSize

    for (let i = 0; i < frusta.length; ++i) {
      const frustum = frusta[i]
      const cascade = cascades[i]

      // Update projection matrix.
      const radius = this.getFrustumRadius(camera, frusta[i])
      const left = -radius
      const right = radius
      const top = radius
      const bottom = -radius
      cascade.projectionMatrix.makeOrthographic(
        left,
        right,
        top,
        bottom,
        -this.margin, // near
        radius * 2 + this.margin // far
      )

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

      // Round light-space translation to even texel increments.
      const texelWidth = (right - left) / mapSize.width
      const texelHeight = (top - bottom) / mapSize.height
      center.x = Math.round(center.x / texelWidth) * texelWidth
      center.y = Math.round(center.y / texelHeight) * texelHeight

      // Update inverse view matrix.
      center.applyMatrix4(lightOrientationMatrix)
      const position = vectorScratch2
        .copy(sunDirection)
        .multiplyScalar(distance)
        .add(center)
      cascade.inverseViewMatrix
        .lookAt(center, position, Object3D.DEFAULT_UP)
        .setPosition(position)
    }
  }

  update(
    camera: PerspectiveCamera,
    sunDirection: Vector3,
    distance?: number
  ): void {
    this._far =
      this.maxFar != null
        ? Math.min(this.maxFar, camera.far * this.farScale)
        : camera.far * this.farScale

    this.updateIntervals(camera)
    this.updateMatrices(camera, sunDirection, distance)

    const cascades = this.cascades
    const cascadeCount = this.cascadeCount
    for (let i = 0; i < cascadeCount; ++i) {
      const {
        matrix,
        inverseMatrix,
        projectionMatrix,
        inverseProjectionMatrix,
        viewMatrix,
        inverseViewMatrix
      } = cascades[i]
      inverseProjectionMatrix.copy(projectionMatrix).invert()
      viewMatrix.copy(inverseViewMatrix).invert()
      matrix.copy(projectionMatrix).multiply(viewMatrix)
      inverseMatrix.copy(inverseViewMatrix).multiply(inverseProjectionMatrix)
    }
  }
}
