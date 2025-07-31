import {
  GLSL3,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer
} from 'three'

import { define, resolveIncludes, unrollLoops } from '@takram/three-geospatial'
import { turbo } from '@takram/three-geospatial/shaders'

import { bayerOffsets } from './bayer'

import catmullRomSampling from './shaders/catmullRomSampling.glsl?raw'
import fragmentShader from './shaders/cloudsResolve.frag?raw'
import vertexShader from './shaders/cloudsResolve.vert?raw'
import varianceClipping from './shaders/varianceClipping.glsl?raw'

export interface CloudsResolveMaterialParameters {
  colorBuffer?: Texture | null
  depthVelocityBuffer?: Texture | null
  shadowLengthBuffer?: Texture | null
  colorHistoryBuffer?: Texture | null
  shadowLengthHistoryBuffer?: Texture | null
}

export interface CloudsResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  colorBuffer: Uniform<Texture | null>
  depthVelocityBuffer: Uniform<Texture | null>
  shadowLengthBuffer: Uniform<Texture | null>
  colorHistoryBuffer: Uniform<Texture | null>
  shadowLengthHistoryBuffer: Uniform<Texture | null>
  texelSize: Uniform<Vector2>
  frame: Uniform<number>
  jitterOffset: Uniform<Vector2>
  varianceGamma: Uniform<number>
  temporalAlpha: Uniform<number>
}

export class CloudsResolveMaterial extends RawShaderMaterial {
  declare uniforms: CloudsResolveMaterialUniforms

  constructor({
    colorBuffer = null,
    depthVelocityBuffer = null,
    shadowLengthBuffer = null,
    colorHistoryBuffer = null,
    shadowLengthHistoryBuffer = null
  }: CloudsResolveMaterialParameters = {}) {
    super({
      name: 'CloudsResolveMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          core: { turbo },
          catmullRomSampling,
          varianceClipping
        })
      ),
      uniforms: {
        colorBuffer: new Uniform(colorBuffer),
        depthVelocityBuffer: new Uniform(depthVelocityBuffer),
        shadowLengthBuffer: new Uniform(shadowLengthBuffer),
        colorHistoryBuffer: new Uniform(colorHistoryBuffer),
        shadowLengthHistoryBuffer: new Uniform(shadowLengthHistoryBuffer),
        texelSize: new Uniform(new Vector2()),
        frame: new Uniform(0),
        jitterOffset: new Uniform(new Vector2()),
        varianceGamma: new Uniform(2),
        temporalAlpha: new Uniform(0.1)
      } satisfies CloudsResolveMaterialUniforms
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
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
    const frame = uniforms.frame.value % 16
    const offset = bayerOffsets[frame]
    const dx = (offset.x - 0.5) * 4
    const dy = (offset.y - 0.5) * 4
    this.uniforms.jitterOffset.value.set(dx, dy)
  }

  @define('TEMPORAL_UPSCALE')
  temporalUpscale = true

  @define('SHADOW_LENGTH')
  shadowLength = true
}
