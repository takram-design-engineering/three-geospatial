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

import atmosphereShader from './shaders/atmosphereShader.glsl'
import fragmentShader from './shaders/fragmentShader.glsl'
import vertexShader from './shaders/vertexShader.glsl'

export interface AtmosphereMaterialParameters
  extends Partial<ShaderMaterialParameters> {
  irradianceTexture?: Texture
  scatteringTexture?: Texture
  transmittanceTexture?: Texture
  sunDirection?: Vector3
  sunAngularRadius?: number
  exposure?: number
}

export class AtmosphereMaterial extends RawShaderMaterial {
  #sunAngularRadius!: number

  constructor({
    irradianceTexture,
    scatteringTexture,
    transmittanceTexture,
    sunDirection,
    sunAngularRadius = 0.00465, // 16 minutes of arc
    exposure = 10,
    ...params
  }: AtmosphereMaterialParameters = {}) {
    super({
      ...params,
      glslVersion: '300 es',
      fragmentShader: `${atmosphereShader}${fragmentShader}`,
      vertexShader,
      uniforms: {
        irradiance_texture: new Uniform(irradianceTexture),
        scattering_texture: new Uniform(scatteringTexture),
        single_mie_scattering_texture: new Uniform(scatteringTexture),
        transmittance_texture: new Uniform(transmittanceTexture),
        projectionMatrixInverse: new Uniform(new Matrix4()),
        viewMatrixInverse: new Uniform(new Matrix4()),
        cameraPosition: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
        sunSize: new Uniform(new Vector2()),
        exposure: new Uniform(exposure)
      },
      depthWrite: false,
      depthTest: false
    })
    if (sunAngularRadius != null) {
      this.sunAngularRadius = sunAngularRadius
    }
  }

  onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    const uniforms = this.uniforms
    uniforms.viewMatrixInverse.value.copy(camera.matrixWorld)
    uniforms.viewMatrixInverse.value.elements[12] *= METER_TO_LENGTH_UNIT
    uniforms.viewMatrixInverse.value.elements[13] *= METER_TO_LENGTH_UNIT
    uniforms.viewMatrixInverse.value.elements[14] *= METER_TO_LENGTH_UNIT
    uniforms.projectionMatrixInverse.value.copy(camera.projectionMatrixInverse)
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
    return this.#sunAngularRadius
  }

  set sunAngularRadius(value: number) {
    this.uniforms.sunSize.value.set(Math.tan(value), Math.cos(value))
    this.#sunAngularRadius = value
  }

  // TODO: Move to post-processing effect.
  get exposure(): number {
    return this.uniforms.exposure.value
  }

  set exposure(value: number) {
    this.uniforms.exposure.value = value
  }
}
