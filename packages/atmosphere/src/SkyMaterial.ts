/// <reference types="vite-plugin-glsl/ext" />

import {
  GLSL3,
  Matrix4,
  Uniform,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type Scene,
  type WebGLRenderer
} from 'three'

import {
  AtmosphereMaterialBase,
  atmosphereMaterialParametersBaseDefaults,
  type AtmosphereMaterialBaseParameters
} from './AtmosphereMaterialBase'

import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import fragmentShader from './shaders/sky.frag'
import sky from './shaders/sky.glsl'
import vertexShader from './shaders/sky.vert'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export interface SkyMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const skyMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1
} satisfies SkyMaterialParameters

export class SkyMaterial extends AtmosphereMaterialBase {
  constructor(params?: SkyMaterialParameters) {
    const {
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...skyMaterialParametersDefaults, ...params }

    super({
      glslVersion: GLSL3,
      vertexShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${vertexShader}
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${functions}
        ${sky}
        ${fragmentShader}
      `,
      ...others,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
        moonAngularRadius: new Uniform(moonAngularRadius),
        lunarRadianceScale: new Uniform(lunarRadianceScale),
        ...others.uniforms
      },
      defines: {
        PERSPECTIVE_CAMERA: '1'
      },
      depthTest: true
    })
    this.sun = sun
    this.moon = moon
  }

  override onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    super.onBeforeRender(renderer, scene, camera, geometry, object, group)
    const uniforms = this.uniforms
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)

    const isPerspectiveCamera = camera.isPerspectiveCamera === true
    if ((this.defines.PERSPECTIVE_CAMERA != null) !== isPerspectiveCamera) {
      if (isPerspectiveCamera) {
        this.defines.PERSPECTIVE_CAMERA = '1'
      } else {
        delete this.defines.PERSPECTIVE_CAMERA
      }
      this.needsUpdate = true
    }
  }

  get sun(): boolean {
    return this.defines.SUN != null
  }

  set sun(value: boolean) {
    if (value !== this.sun) {
      if (value) {
        this.defines.SUN = '1'
      } else {
        delete this.defines.SUN
      }
      this.needsUpdate = true
    }
  }

  get moon(): boolean {
    return this.defines.MOON != null
  }

  set moon(value: boolean) {
    if (value !== this.moon) {
      if (value) {
        this.defines.MOON = '1'
      } else {
        delete this.defines.MOON
      }
      this.needsUpdate = true
    }
  }

  get moonDirection(): Vector3 {
    return this.uniforms.moonDirection.value
  }

  get moonAngularRadius(): number {
    return this.uniforms.moonAngularRadius.value
  }

  set moonAngularRadius(value: number) {
    this.uniforms.moonAngularRadius.value = value
  }

  get lunarRadianceScale(): number {
    return this.uniforms.lunarRadianceScale.value
  }

  set lunarRadianceScale(value: number) {
    this.uniforms.lunarRadianceScale.value = value
  }
}
