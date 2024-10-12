import { type Matrix4, type Vector3 } from 'three'

export interface CSMFrustumVertices {
  near: Vector3[]
  far: Vector3[]
}

export interface CSMFrustumParameters {
  projectionMatrix?: Matrix4
  maxFar?: number
}

export class CSMFrustum {
  constructor(data?: CSMFrustumParameters)
  vertices: CSMFrustumVertices
  setFromProjectionMatrix(
    projectionMatrix: Matrix4,
    maxFar: number
  ): CSMFrustumVertices
  split(breaks: number[], target: CSMFrustum[]): void
  toSpace(cameraMatrix: Matrix4, target: CSMFrustum): void
}
