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
  type Camera,
  type PerspectiveCamera
} from 'three'
import invariant from 'tiny-invariant'

import { assertType } from './assertions'
import { FrustumCorners } from './helpers/FrustumCorners'
import { splitFrustum, type FrustumSplitMode } from './helpers/splitFrustum'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const matrixScratch1 = /*#__PURE__*/ new Matrix4()
const matrixScratch2 = /*#__PURE__*/ new Matrix4()
const frustumScratch = /*#__PURE__*/ new FrustumCorners()
const boxScratch = /*#__PURE__*/ new Box3()

export class Cascade {
  readonly interval = new Vector2()
  readonly projectionMatrix = new Matrix4()
  readonly inverseProjectionMatrix = new Matrix4()
  readonly viewMatrix = new Matrix4()
  readonly inverseViewMatrix = new Matrix4()

  // Save for constructing directional lights later.
  readonly lightPosition = new Vector3()
  readonly lightTarget = new Vector3()
  projectionParams = {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    near: 0,
    far: 0
  }

  updateProjectionMatrix(
    left: number,
    right: number,
    top: number,
    bottom: number,
    near: number,
    far: number
  ): void {
    this.projectionMatrix.makeOrthographic(left, right, top, bottom, near, far)
    this.inverseProjectionMatrix.copy(this.projectionMatrix).invert()
    this.projectionParams = { left, right, top, bottom, near, far }
  }

  updateViewMatrix(position: Vector3, target: Vector3): void {
    this.inverseViewMatrix
      .lookAt(target, position, Object3D.DEFAULT_UP)
      .setPosition(position)
    this.viewMatrix.copy(this.inverseViewMatrix).invert()
    this.lightPosition.copy(position)
    this.lightTarget.copy(target)
  }
}

export interface CascadedShadowOptions {
  cascadeCount: number
  mapSize: Vector2
  maxFar?: number | null
  farScale?: number
  splitMode?: FrustumSplitMode
  splitLambda?: number
  margin?: number
  fade?: boolean
}

export class CascadedShadow {
  readonly cascades: Cascade[] = []

  readonly mapSize = new Vector2()
  maxFar: number | null
  farScale: number
  splitMode: FrustumSplitMode
  splitLambda: number
  margin: number
  fade: boolean

  readonly cameraFrustum = new FrustumCorners()
  readonly frusta: FrustumCorners[] = []
  readonly splits: number[] = []
  private _far = 0

  constructor(options: CascadedShadowOptions) {
    const {
      cascadeCount,
      mapSize,
      maxFar = null,
      farScale = 1,
      splitMode = 'practical',
      splitLambda = 0.5,
      margin = 0,
      fade = true
    } = options
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
        this.cascades[i] ??= new Cascade()
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
      cascade.updateProjectionMatrix(
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
      const target = bbox.getCenter(vectorScratch1)
      target.z = bbox.max.z + margin

      // Round light-space translation to even texel increments.
      const texelWidth = (right - left) / mapSize.width
      const texelHeight = (top - bottom) / mapSize.height
      target.x = Math.round(target.x / texelWidth) * texelWidth
      target.y = Math.round(target.y / texelHeight) * texelHeight

      // Update view matrix.
      target.applyMatrix4(lightOrientationMatrix)
      const position = vectorScratch2
        .copy(sunDirection)
        .multiplyScalar(distance)
        .add(target)
      cascade.updateViewMatrix(position, target)
    }
  }

  updateCascades(
    camera: Camera,
    sunDirection: Vector3,
    distance?: number
  ): void {
    if (camera.isPerspectiveCamera !== true) {
      return
    }
    assertType<PerspectiveCamera>(camera)

    this._far =
      this.maxFar != null
        ? Math.min(this.maxFar, camera.far * this.farScale)
        : camera.far * this.farScale

    this.updateIntervals(camera)
    this.updateMatrices(camera, sunDirection, distance)
  }
}
