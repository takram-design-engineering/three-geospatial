/// <reference types="vite-plugin-glsl/ext" />

import {
  Matrix4,
  NoBlending,
  PerspectiveCamera,
  ShaderMaterial,
  Uniform,
  Vector2,
  type Camera,
  type OrthographicCamera,
  type ShaderMaterialParameters,
  type Texture
} from 'three'

import { assertType } from '@geovanni/core'

import packing from './shaders/packing.glsl'
import fragmentShader from './shaders/ssr.frag'
import vertexShader from './shaders/ssr.vert'

export interface SSRMaterialParameters extends ShaderMaterialParameters {
  inputBuffer?: Texture | null
  geometryBuffer?: Texture | null
  depthBuffer?: Texture | null
  maxSteps?: number
  maxDistance?: number
  thickness?: number
}

export const ssrMaterialParametersDefaults = {
  maxSteps: 500,
  maxDistance: 100,
  thickness: 0.01
} satisfies SSRMaterialParameters

export class SSRMaterial extends ShaderMaterial {
  constructor(params?: SSRMaterialParameters) {
    const {
      inputBuffer,
      geometryBuffer,
      depthBuffer,
      maxSteps,
      maxDistance,
      thickness,
      ...others
    } = {
      ...ssrMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'SSRMaterial',
      fragmentShader: /* glsl */ `
        ${packing}
        ${fragmentShader}
      `,
      vertexShader,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer ?? null),
        geometryBuffer: new Uniform(geometryBuffer ?? null),
        depthBuffer: new Uniform(depthBuffer ?? null),
        projectionMatrix: new Uniform(new Matrix4()),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        cameraNear: new Uniform(0),
        cameraFar: new Uniform(1),
        resolution: new Uniform(new Vector2()),
        maxDistance: new Uniform(maxDistance),
        thickness: new Uniform(thickness)
      },
      defines: {
        DEPTH_PACKING: '0',
        MAX_STEPS: `${maxSteps}`
      },
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)
  }

  copyCameraSettings(camera?: Camera | null): void {
    if (camera == null) {
      return
    }
    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    const uniforms = this.uniforms
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)

    if (camera instanceof PerspectiveCamera) {
      this.defines.PERSPECTIVE_CAMERA = '1'
    } else {
      delete this.defines.PERSPECTIVE_CAMERA
    }
    this.needsUpdate = true
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  get geometryBuffer(): Texture | null {
    return this.uniforms.geometryBuffer.value
  }

  set geometryBuffer(value: Texture | null) {
    this.uniforms.geometryBuffer.value = value
  }

  get depthBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set depthBuffer(value) {
    this.uniforms.depthBuffer.value = value
  }

  get depthPacking(): number {
    return +this.defines.DEPTH_PACKING
  }

  set depthPacking(value: number) {
    if (value !== this.depthPacking) {
      this.defines.DEPTH_PACKING = `${value}`
      this.needsUpdate = true
    }
  }

  get maxSteps(): number {
    return +this.defines.MAX_STEPS
  }

  set maxSteps(value: number) {
    if (value !== this.maxSteps) {
      this.defines.MAX_STEPS = `${value}`
      this.needsUpdate = true
    }
  }

  get maxDistance(): number {
    return this.uniforms.maxDistance.value
  }

  set maxDistance(value: number) {
    this.uniforms.maxDistance.value = value
  }

  get thickness(): number {
    return this.uniforms.thickness.value
  }

  set thickness(value: number) {
    this.uniforms.thickness.value = value
  }
}
