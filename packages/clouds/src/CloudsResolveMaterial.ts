import {
  GLSL3,
  NoBlending,
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

import {
  bayerOffsets,
  define,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import {
  catmullRomSampling,
  temporalResolve,
  turbo,
  varianceClipping
} from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/cloudsResolveMaterial.frag?raw'
import vertexShader from './shaders/cloudsResolveMaterial.vert?raw'

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
          core: {
            catmullRomSampling,
            turbo,
            varianceClipping,
            temporalResolve
          }
        })
      ),
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
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

  onBeforeRender(
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
