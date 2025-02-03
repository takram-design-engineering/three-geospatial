import { Pass } from 'postprocessing'
import {
  Camera,
  type Data3DTexture,
  type Material,
  type Matrix4,
  type Texture,
  type Vector3
} from 'three'

import { type CascadedShadowMaps } from './CascadedShadowMaps'
import { type CloudParameterUniforms } from './uniforms'

export interface CloudsPassBaseOptions {
  ellipsoidCenter: Vector3
  ellipsoidMatrix: Matrix4
  sunDirection: Vector3
  shadow: CascadedShadowMaps
}

export abstract class CloudsPassBase extends Pass {
  readonly ellipsoidCenter: Vector3
  readonly ellipsoidMatrix: Matrix4
  readonly sunDirection: Vector3
  shadow: CascadedShadowMaps

  abstract currentMaterial: Material & {
    uniforms: CloudParameterUniforms
  }

  private _mainCamera = new Camera()

  constructor(name: string, options: CloudsPassBaseOptions) {
    super(name)
    const { ellipsoidCenter, ellipsoidMatrix, sunDirection, shadow } = options

    // Vectors and matrices are intentionally not copied but referenced.
    this.ellipsoidCenter = ellipsoidCenter
    this.ellipsoidMatrix = ellipsoidMatrix
    this.sunDirection = sunDirection
    this.shadow = shadow
  }

  get mainCamera(): Camera {
    return this._mainCamera
  }

  set mainCamera(value: Camera) {
    this._mainCamera = value
  }

  get localWeatherTexture(): Texture | null {
    return this.currentMaterial.uniforms.localWeatherTexture.value
  }

  set localWeatherTexture(value: Texture | null) {
    this.currentMaterial.uniforms.localWeatherTexture.value = value
  }

  get shapeTexture(): Data3DTexture | null {
    return this.currentMaterial.uniforms.shapeTexture.value
  }

  set shapeTexture(value: Data3DTexture | null) {
    this.currentMaterial.uniforms.shapeTexture.value = value
  }

  get shapeDetailTexture(): Data3DTexture | null {
    return this.currentMaterial.uniforms.shapeDetailTexture.value
  }

  set shapeDetailTexture(value: Data3DTexture | null) {
    this.currentMaterial.uniforms.shapeDetailTexture.value = value
  }

  get turbulenceTexture(): Texture | null {
    return this.currentMaterial.uniforms.turbulenceTexture.value
  }

  set turbulenceTexture(value: Texture | null) {
    this.currentMaterial.uniforms.turbulenceTexture.value = value
  }
}
