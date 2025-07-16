import {
  GLSL3,
  NoBlending,
  RawShaderMaterial,
  ShaderMaterialParameters,
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

import { bayerOffsets } from './bayer'
import { define } from './decorators'

export interface TemporalResolveMaterialParameters
  extends ShaderMaterialParameters {
  fragmentShader?: string
  vertexShader?: string
  inputBuffer?: Texture | null
  depthVelocityBuffer?: Texture | null
  historyBuffer?: Texture | null
}

export interface TemporalResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  depthVelocityBuffer: Uniform<Texture | null>
  historyBuffer: Uniform<Texture | null>
  texelSize: Uniform<Vector2>
  frame: Uniform<number>
  jitterOffset: Uniform<Vector2>
  varianceGamma: Uniform<number>
  temporalAlpha: Uniform<number>
}

export class TemporalResolveMaterial<
  Uniforms extends Record<string, Uniform<unknown>> = {}
> extends RawShaderMaterial {
  declare uniforms: Uniforms & TemporalResolveMaterialUniforms

  constructor({
    inputBuffer = null,
    depthVelocityBuffer = null,
    historyBuffer = null,
    ...others
  }: TemporalResolveMaterialParameters) {
    super({
      name: 'TemporalResolveMaterial',
      glslVersion: GLSL3,
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        depthVelocityBuffer: new Uniform(depthVelocityBuffer),
        historyBuffer: new Uniform(historyBuffer),
        texelSize: new Uniform(new Vector2()),
        frame: new Uniform(0),
        jitterOffset: new Uniform(new Vector2()),
        varianceGamma: new Uniform(2),
        temporalAlpha: new Uniform(0.1),
        ...others.uniforms
      } satisfies TemporalResolveMaterialUniforms
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
}
