/// <reference types="vite-plugin-glsl/ext" />

import {
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type Scene,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLRenderer
} from 'three'

import { METER_TO_LENGTH_UNIT } from './constants'

import fragmentShader from './shaders/atmosphere.frag'
import vertexShader from './shaders/atmosphere.vert'
import atmosphericScattering from './shaders/atmosphericScattering.glsl'

export interface AtmosphereMaterialParameters
  extends Partial<ShaderMaterialParameters> {
  irradianceTexture?: Texture
  scatteringTexture?: Texture
  transmittanceTexture?: Texture
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export class AtmosphereMaterial extends RawShaderMaterial {
  private _sunAngularRadius!: number

  constructor({
    irradianceTexture,
    scatteringTexture,
    transmittanceTexture,
    sunDirection,
    sunAngularRadius = 0.00465, // 16 minutes of arc
    ...params
  }: AtmosphereMaterialParameters = {}) {
    super({
      ...params,
      glslVersion: '300 es',
      fragmentShader: `${atmosphericScattering}${fragmentShader}`,
      vertexShader,
      uniforms: {
        irradiance_texture: new Uniform(irradianceTexture),
        scattering_texture: new Uniform(scatteringTexture),
        single_mie_scattering_texture: new Uniform(scatteringTexture),
        transmittance_texture: new Uniform(transmittanceTexture),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        cameraPosition: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
        sunSize: new Uniform(new Vector2())
      },
      depthWrite: false,
      depthTest: false
    })
    if (sunAngularRadius != null) {
      this.sunAngularRadius = sunAngularRadius
    }
  }

  override onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    const uniforms = this.uniforms
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)
    uniforms.inverseViewMatrix.value.elements[12] *= METER_TO_LENGTH_UNIT
    uniforms.inverseViewMatrix.value.elements[13] *= METER_TO_LENGTH_UNIT
    uniforms.inverseViewMatrix.value.elements[14] *= METER_TO_LENGTH_UNIT
    uniforms.cameraPosition.value
      .copy(camera.position)
      .multiplyScalar(METER_TO_LENGTH_UNIT)
  }

  get irradianceTexture(): Texture | null {
    return this.uniforms.irradiance_texture.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.irradiance_texture.value = value
  }

  get scatteringTexture(): Texture | null {
    return this.uniforms.scattering_texture.value
  }

  set scatteringTexture(value: Texture | null) {
    this.uniforms.scattering_texture.value = value
    this.uniforms.single_mie_scattering_texture.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.transmittance_texture.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.transmittance_texture.value = value
  }

  get sunDirection(): Vector3 {
    return this.uniforms.sunDirection.value
  }

  set sunDirection(value: Vector3) {
    this.uniforms.sunDirection.value.copy(value)
  }

  get sunAngularRadius(): number {
    return this._sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.uniforms.sunSize.value.set(Math.tan(value), Math.cos(value))
    this._sunAngularRadius = value
  }
}
