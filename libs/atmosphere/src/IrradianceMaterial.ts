/// <reference types="vite-plugin-glsl/ext" />

import {
  Matrix4,
  Uniform,
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
import fragmentShader from './shaders/irradiance.frag'
import vertexShader from './shaders/irradiance.vert'
import parameters from './shaders/parameters.glsl'
import vertexCommon from './shaders/vertexCommon.glsl'

export interface IrradianceMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  sun?: boolean
}

export const irradianceMaterialParametersDefaults = {
  sun: false,
  ...atmosphereMaterialParametersBaseDefaults
} satisfies IrradianceMaterialParameters

export class IrradianceMaterial extends AtmosphereMaterialBase {
  constructor(params?: IrradianceMaterialParameters) {
    const { sun, ...others } = {
      ...irradianceMaterialParametersDefaults,
      ...params
    }

    super({
      glslVersion: '300 es',
      vertexShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${vertexCommon}
        ${vertexShader}
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${functions}
        ${fragmentShader}
      `,
      ...others,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        ...others.uniforms
      }
    })
    this.sun = sun
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
}
