import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Matrix4,
  Uniform,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import {
  define,
  resolveIncludes,
  type UniformMap
} from '@takram/three-geospatial'
import { depth, packing, transform } from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/normalEffect.frag?raw'

export interface NormalEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  octEncoded?: boolean
  reconstructFromDepth?: boolean
}

export interface NormalEffectUniforms {
  normalBuffer: Uniform<Texture | null>
  projectionMatrix: Uniform<Matrix4>
  inverseProjectionMatrix: Uniform<Matrix4>
}

export const normalEffectOptionsDefaults = {
  blendFunction: BlendFunction.SRC,
  octEncoded: false,
  reconstructFromDepth: false
} satisfies NormalEffectOptions

export class NormalEffect extends Effect {
  declare uniforms: UniformMap<NormalEffectUniforms>

  constructor(
    private camera: Camera,
    options?: NormalEffectOptions
  ) {
    const {
      blendFunction,
      normalBuffer = null,
      octEncoded,
      reconstructFromDepth
    } = {
      ...normalEffectOptionsDefaults,
      ...options
    }
    super(
      'NormalEffect',
      resolveIncludes(fragmentShader, {
        core: {
          depth,
          packing,
          transform
        }
      }),
      {
        blendFunction,
        attributes: EffectAttribute.DEPTH,
        uniforms: new Map<string, Uniform>(
          Object.entries({
            normalBuffer: new Uniform(normalBuffer),
            projectionMatrix: new Uniform(new Matrix4()),
            inverseProjectionMatrix: new Uniform(new Matrix4())
          } satisfies NormalEffectUniforms)
        )
      }
    )
    if (camera != null) {
      this.mainCamera = camera
    }
    this.octEncoded = octEncoded
    this.reconstructFromDepth = reconstructFromDepth
  }

  override get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    const uniforms = this.uniforms
    const projectionMatrix = uniforms.get('projectionMatrix')
    const inverseProjectionMatrix = uniforms.get('inverseProjectionMatrix')
    const camera = this.camera
    if (camera != null) {
      projectionMatrix.value.copy(camera.projectionMatrix)
      inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    }
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer').value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer').value = value
  }

  @define('OCT_ENCODED')
  octEncoded: boolean

  @define('RECONSTRUCT_FROM_DEPTH')
  reconstructFromDepth: boolean
}
