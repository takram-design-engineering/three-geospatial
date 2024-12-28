// Based on the following work:
// https://github.com/StrandedKitty/three-csm/
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

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

function extractOrthographicTuple(
  matrix: Matrix4
): [left: number, right: number, top: number, bottom: number] {
  const elements = matrix.elements
  const m00 = elements[0] // 2 / (right - left)
  const m03 = elements[12] // -(right + left) / (right - left)
  const m11 = elements[5] // 2 / (top - bottom)
  const m13 = elements[13] // -(top + bottom) / (top - bottom)
  const RmL = 2 / m00 // (right - left)
  const RpL = RmL * -m03 // (right + left)
  const TmB = 2 / m11 // (top - bottom)
  const TpB = TmB * -m13 // (t + bottom)
  return [
    (RpL - RmL) / 2, // left
    (RmL + RpL) / 2, // right
    (TmB + TpB) / 2, // top
    (TpB - TmB) / 2 // bottom
  ]
}

export interface CascadedShadowsOptions {
  cascadeCount?: number
  mapSize?: number
  far?: number
  mode?: FrustumSplitMode
  lambda?: number
  margin?: number
  fade?: boolean
}

export const cascadedShadowsOptionsDefaults = {
  cascadeCount: 4,
  mapSize: 2048,
  far: 1e4,
  mode: 'practical',
  lambda: 0.5,
  margin: 200,
  fade: true
} satisfies Partial<CascadedShadowsOptions>

interface Light {
  readonly projectionMatrix: Matrix4
  readonly inverseViewMatrix: Matrix4
}

export class CascadedShadows {
  readonly lights: Light[] = []
  readonly cascadeMatrix = new Matrix4()

  mapSize: number
  far: number
  mode: FrustumSplitMode
  lambda: number
  margin: number
  fade: boolean

  private readonly cascadedFrusta: FrustumCorners[] = []
  private readonly splits: number[] = []
  readonly cascades: Vector2[] = []

  constructor(options?: CascadedShadowsOptions) {
    const { cascadeCount, mapSize, far, mode, lambda, margin, fade } = {
      ...cascadedShadowsOptionsDefaults,
      ...options
    }
    this.cascadeCount = cascadeCount
    this.mapSize = mapSize
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
    splitFrustum(
      this.mode,
      cascadeCount,
      camera.near,
      this.far,
      this.lambda,
      splits
    )
    frustumScratch.setFromCamera(camera, this.far)
    frustumScratch.split(splits, this.cascadedFrusta)

    const cascades = this.cascades
    for (let i = 0; i < cascadeCount; ++i) {
      const vector = cascades[i] ?? (cascades[i] = new Vector2())
      vector.set(splits[i - 1] ?? 0, splits[i] ?? 0)
    }
    cascades.length = cascadeCount
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

  private updateShadowBounds(camera: PerspectiveCamera): void {
    const frusta = this.cascadedFrusta
    const lights = this.lights
    invariant(frusta.length === lights.length)

    for (let i = 0; i < frusta.length; ++i) {
      const radius = this.getFrustumRadius(camera, this.cascadedFrusta[i])
      lights[i].projectionMatrix.makeOrthographic(
        -radius, // left
        radius, // right
        radius, // top
        -radius, // bottom
        -this.margin, // near
        radius * 2 + this.margin // far
      )
    }
  }

  update(camera: PerspectiveCamera, lightDirection: Vector3): void {
    const lightOrientationMatrix = matrixScratch1.lookAt(
      vectorScratch1.set(0, 0, 0),
      lightDirection,
      Object3D.DEFAULT_UP
    )
    const cameraToLightMatrix = matrixScratch2.multiplyMatrices(
      matrixScratch2.copy(lightOrientationMatrix).invert(),
      camera.matrixWorld
    )

    this.updateCascades(camera)
    this.updateShadowBounds(camera)

    const margin = this.margin
    const mapSize = this.mapSize
    const frusta = this.cascadedFrusta
    const lights = this.lights
    for (let i = 0; i < frusta.length; ++i) {
      const { near, far } = frustumScratch
        .copy(frusta[i])
        .applyMatrix4(cameraToLightMatrix)
      const bbox = boxScratch.makeEmpty()
      for (let j = 0; j < 4; j++) {
        bbox.expandByPoint(near[j])
        bbox.expandByPoint(far[j])
      }
      const center = bbox.getCenter(vectorScratch1)
      center.z = bbox.max.z + margin

      // Round light-space translation to even texel increments.
      const light = lights[i]
      const [left, right, top, bottom] = extractOrthographicTuple(
        light.projectionMatrix
      )
      const texelWidth = (right - left) / mapSize
      const texelHeight = (top - bottom) / mapSize
      center.x = Math.round(center.x / texelWidth) * texelWidth
      center.y = Math.round(center.y / texelHeight) * texelHeight

      center.applyMatrix4(lightOrientationMatrix)
      const position = vectorScratch2
        .copy(lightDirection)
        .multiplyScalar(-500000)
        .add(center)
      light.inverseViewMatrix
        .lookAt(center, position, Object3D.DEFAULT_UP)
        .setPosition(position)
    }
  }
}
