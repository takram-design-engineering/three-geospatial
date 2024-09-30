/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Matrix4,
  Uniform,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { METER_TO_LENGTH_UNIT } from './constants'

import fragmentShader from './shaders/aerialPerspective.frag'
import vertexShader from './shaders/aerialPerspective.vert'
import atmosphericScattering from './shaders/atmosphericScattering.glsl'

export interface AerialPerspectiveEffectOptions {
  camera?: Camera
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
}

export class AerialPerspectiveEffect extends Effect {
  camera?: Camera | null

  constructor({
    camera,
    blendFunction = BlendFunction.NORMAL,
    normalBuffer = null
  }: AerialPerspectiveEffectOptions = {}) {
    super(
      'AerialPerspectiveEffect',
      `${atmosphericScattering}${fragmentShader}`,
      {
        blendFunction,
        vertexShader,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, Uniform>([
          ['irradiance_texture', new Uniform(null)],
          ['scattering_texture', new Uniform(null)],
          ['single_mie_scattering_texture', new Uniform(null)],
          ['transmittance_texture', new Uniform(null)],
          ['normalBuffer', new Uniform(normalBuffer)],
          ['inverseProjectionMatrix', new Uniform(new Matrix4())],
          ['inverseViewMatrix', new Uniform(new Matrix4())],
          ['cameraPosition', new Uniform(new Vector3())],
          ['sunDirection', new Uniform(new Vector3())]
        ]),
        defines: new Map<string, string>([
          ['METER_TO_LENGTH_UNIT', `${METER_TO_LENGTH_UNIT}`]
        ])
      }
    )
    this.camera = camera
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    if (renderer.capabilities.logarithmicDepthBuffer) {
      this.defines.set('LOG_DEPTH', '1')
    } else {
      this.defines.delete('LOG_DEPTH')
    }
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    if (this.camera == null) {
      return
    }
    const uniforms = this.uniforms
    const inverseProjectionMatrix = uniforms.get('inverseProjectionMatrix')!
    const inverseViewMatrix = uniforms.get('inverseViewMatrix')!
    const cameraPosition = uniforms.get('cameraPosition')!
    const camera = this.camera
    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    inverseViewMatrix.value.copy(camera.matrixWorld)
    cameraPosition.value.copy(camera.position)
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get irradianceTexture(): Texture | null {
    return this.uniforms.get('irradiance_texture')!.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.get('irradiance_texture')!.value = value
  }

  get scatteringTexture(): Texture | null {
    return this.uniforms.get('scattering_texture')!.value
  }

  set scatteringTexture(value: Texture | null) {
    this.uniforms.get('scattering_texture')!.value = value
    this.uniforms.get('single_mie_scattering_texture')!.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.get('transmittance_texture')!.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.get('transmittance_texture')!.value = value
  }

  get sunDirection(): Vector3 {
    return this.uniforms.get('sunDirection')!.value
  }

  set sunDirection(value: Vector3) {
    this.uniforms.get('sunDirection')!.value.copy(value)
  }
}
