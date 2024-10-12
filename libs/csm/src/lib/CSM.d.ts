import {
  type Camera,
  type DirectionalLight,
  type Material,
  type Object3D,
  type Vector2,
  type Vector3
} from 'three'

import { type CSMFrustum } from './CSMFrustum.js'

export type CMSMode = 'practical' | 'uniform' | 'logarithmic' | 'custom'

export interface CMSParameters {
  camera?: Camera
  parent?: Object3D
  cascades?: number
  maxFar?: number
  mode?: CMSMode
  shadowMapSize?: number
  shadowBias?: number
  lightDirection?: Vector3
  lightIntensity?: number
  lightNear?: number
  lightFar?: number
  lightMargin?: number
  customSplitsCallback?: (
    cascades: number,
    cameraNear: number,
    cameraFar: number,
    breaks: number[]
  ) => void
}

export class CSM {
  constructor(data?: CMSParameters)
  camera: Camera
  parent: Object3D
  cascades: number
  maxFar: number
  mode: CMSMode
  shadowMapSize: number
  shadowBias: number
  lightDirection: Vector3
  lightIntensity: number
  lightNear: number
  lightFar: number
  lightMargin: NumberArray12
  fade: boolean
  mainFrustum: CSMFrustum
  frustums: CSMFrustum[]
  breaks: number[]
  lights: DirectionalLight[]
  shaders: Map<unknown, string>
  customSplitsCallback: (
    cascades: number,
    cameraNear: number,
    cameraFar: number,
    breaks: number[]
  ) => void
  createLights(): void
  initCascades(): void
  updateShadowBounds(): void
  getBreaks(): void
  update(): void
  injectInclude(): void
  setupMaterial(material: Material): void
  updateUniforms(): void
  getExtendedBreaks(target: Vector2[]): void
  updateFrustums(): void
  remove(): void
  dispose(): void
}
