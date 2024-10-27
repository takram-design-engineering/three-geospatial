/// <reference types="vite-plugin-glsl/ext" />

import {
  GLSL3,
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
import parameters from './shaders/parameters.glsl'
import fragmentShader from './shaders/skyRadiance.frag'
import vertexShader from './shaders/skyRadiance.vert'

export interface SkyRadianceMaterialParameters
  extends AtmosphereMaterialBaseParameters {}

export const skyRadianceMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults
} satisfies SkyRadianceMaterialParameters

export class SkyRadianceMaterial extends AtmosphereMaterialBase {
  constructor(params?: SkyRadianceMaterialParameters) {
    const { ...others } = {
      ...skyRadianceMaterialParametersDefaults,
      ...params
    }

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
        ${fragmentShader}
      `,
      ...others,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        ...others.uniforms
      }
    })
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
}
