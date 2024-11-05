/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Matrix4,
  Uniform,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { depthShader, packingShader, transformShader } from '@geovanni/core'

import fragmentShader from './shaders/normalEffect.frag'

export interface NormalEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  octEncoded?: boolean
  reconstructFromDepth?: boolean
}

export const normalEffectOptionsDefaults = {
  blendFunction: BlendFunction.SRC,
  octEncoded: false,
  reconstructFromDepth: false
} satisfies NormalEffectOptions

export class NormalEffect extends Effect {
  constructor(
    private camera: Camera,
    options?: NormalEffectOptions
  ) {
    const { blendFunction, normalBuffer, octEncoded, reconstructFromDepth } = {
      ...normalEffectOptionsDefaults,
      ...options
    }
    super(
      'NormalEffect',
      /* glsl */ `
        ${depthShader}
        ${packingShader}
        ${transformShader}
        ${fragmentShader}
      `,
      {
        blendFunction,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, Uniform>([
          ['normalBuffer', new Uniform(normalBuffer)],
          ['projectionMatrix', new Uniform(new Matrix4())],
          ['inverseProjectionMatrix', new Uniform(new Matrix4())]
        ])
      }
    )
    if (camera != null) {
      this.mainCamera = camera
    }
    this.octEncoded = octEncoded
    this.reconstructFromDepth = reconstructFromDepth
  }

  get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
  }

  update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    const uniforms = this.uniforms
    const projectionMatrix = uniforms.get('projectionMatrix')!
    const inverseProjectionMatrix = uniforms.get('inverseProjectionMatrix')!
    const camera = this.camera
    if (camera != null) {
      projectionMatrix.value.copy(camera.projectionMatrix)
      inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    }
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get octEncoded(): boolean {
    return this.defines.has('OCT_ENCODED')
  }

  set octEncoded(value: boolean) {
    if (value !== this.octEncoded) {
      if (value) {
        this.defines.set('OCT_ENCODED', '1')
      } else {
        this.defines.delete('OCT_ENCODED')
      }
      this.setChanged()
    }
  }

  get reconstructFromDepth(): boolean {
    return this.defines.has('RECONSTRUCT_FROM_DEPTH')
  }

  set reconstructFromDepth(value: boolean) {
    if (value !== this.reconstructFromDepth) {
      if (value) {
        this.defines.set('RECONSTRUCT_FROM_DEPTH', '1')
      } else {
        this.defines.delete('RECONSTRUCT_FROM_DEPTH')
      }
      this.setChanged()
    }
  }
}
