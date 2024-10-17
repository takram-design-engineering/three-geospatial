// Based on the following work:
// https://github.com/StrandedKitty/three-csm/tree/master/src
// https://github.com/mrdoob/three.js/tree/r169/examples/jsm/csm

import { Vector3, type Camera, type Matrix4 } from 'three'

export class FrustumCorners {
  readonly near = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]
  readonly far = [new Vector3(), new Vector3(), new Vector3(), new Vector3()]

  constructor()
  constructor(camera: Camera, far: number)
  constructor(camera?: Camera, far?: number) {
    if (camera != null && far != null) {
      this.setFromCamera(camera, far)
    }
  }

  clone(): FrustumCorners {
    return new FrustumCorners().copy(this)
  }

  copy(other: FrustumCorners): this {
    for (let i = 0; i < 4; ++i) {
      this.near[i].copy(other.near[i])
      this.far[i].copy(other.far[i])
    }
    return this
  }

  setFromCamera(
    camera: Camera & { isOrthographicCamera?: boolean },
    far: number
  ): this {
    const isOrthographic = camera.isOrthographicCamera === true
    const inverseProjectionMatrix = camera.projectionMatrixInverse

    // 3 --- 0
    // |     |
    // 2 --- 1
    // Clip space spans from [-1, 1]
    this.near[0].set(1, 1, -1)
    this.near[1].set(1, -1, -1)
    this.near[2].set(-1, -1, -1)
    this.near[3].set(-1, 1, -1)
    for (let i = 0; i < 4; ++i) {
      this.near[i].applyMatrix4(inverseProjectionMatrix)
    }

    this.far[0].set(1, 1, 1)
    this.far[1].set(1, -1, 1)
    this.far[2].set(-1, -1, 1)
    this.far[3].set(-1, 1, 1)
    for (let i = 0; i < 4; ++i) {
      const corner = this.far[i]
      corner.applyMatrix4(inverseProjectionMatrix)
      const absZ = Math.abs(corner.z)
      if (isOrthographic) {
        corner.z *= Math.min(far / absZ, 1)
      } else {
        corner.multiplyScalar(Math.min(far / absZ, 1))
      }
    }
    return this
  }

  split(
    clipDepths: readonly number[],
    result: FrustumCorners[] = []
  ): FrustumCorners[] {
    for (let index = 0; index < clipDepths.length; ++index) {
      const frustum = (result[index] ??= new FrustumCorners())
      if (index === 0) {
        for (let i = 0; i < 4; ++i) {
          frustum.near[i].copy(this.near[i])
        }
      } else {
        for (let i = 0; i < 4; ++i) {
          frustum.near[i].lerpVectors(
            this.near[i],
            this.far[i],
            clipDepths[index - 1]
          )
        }
      }
      if (index === clipDepths.length - 1) {
        for (let i = 0; i < 4; ++i) {
          frustum.far[i].copy(this.far[i])
        }
      } else {
        for (let i = 0; i < 4; ++i) {
          frustum.far[i].lerpVectors(
            this.near[i],
            this.far[i],
            clipDepths[index]
          )
        }
      }
    }
    result.length = clipDepths.length
    return result
  }

  applyMatrix4(matrix: Matrix4): this {
    for (let i = 0; i < 4; ++i) {
      this.near[i].applyMatrix4(matrix)
      this.far[i].applyMatrix4(matrix)
    }
    return this
  }
}
