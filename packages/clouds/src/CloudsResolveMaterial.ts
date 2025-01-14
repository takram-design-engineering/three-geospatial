/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type Camera,
  type Texture
} from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'

import fragmentShader from './shaders/cloudsResolve.frag?raw'
import vertexShader from './shaders/cloudsResolve.vert?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface CloudsResolveMaterialParameters {
  inputBuffer?: Texture | null
  depthVelocityBuffer?: Texture | null
  historyBuffer?: Texture | null
}

interface CloudsResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  depthVelocityBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
  reprojectionMatrix: Uniform<Matrix4>
  texelSize: Uniform<Vector2>
  temporalAlpha: Uniform<number>
}

export interface CloudsResolveMaterial {
  uniforms: CloudsResolveMaterialUniforms
}

export class CloudsResolveMaterial extends RawShaderMaterial {
  constructor({
    inputBuffer = null,
    depthVelocityBuffer = null,
    historyBuffer = null
  }: CloudsResolveMaterialParameters = {}) {
    super({
      name: 'CloudsResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(unrollLoops(fragmentShader), {
        varianceClipping
      }),
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        depthVelocityBuffer: new Uniform(depthVelocityBuffer),
        historyBuffer: new Uniform(historyBuffer),
        reprojectionMatrix: new Uniform(new Matrix4()),
        texelSize: new Uniform(new Vector2()),
        temporalAlpha: new Uniform(0.1)
      } satisfies CloudsResolveMaterialUniforms,
      defines: {}
    })
  }

  setReprojectionMatrix(camera: Camera): void {
    const uniforms = this.uniforms
    uniforms.reprojectionMatrix.value
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse)
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
  }
}
