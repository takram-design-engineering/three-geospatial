import {
  Camera,
  DepthPackingStrategies,
  GLSL3,
  NoBlending,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  RGBADepthPacking,
  Texture,
  Uniform
} from 'three'

import {
  assertType,
  define,
  defineInt,
  resolveIncludes
} from '@takram/three-geospatial'
import { depth } from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/lightingMaskMaterial.frag?raw'
import vertexShader from './shaders/lightingMaskMaterial.vert?raw'

export interface LightingMaskMaterialUniforms {
  [key: string]: Uniform<unknown>
  inputBuffer: Uniform<Texture | null>
  depthBuffer0: Uniform<Texture | null>
  depthBuffer1: Uniform<Texture | null>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  inverted: Uniform<boolean>
}

export class LightingMaskMaterial extends RawShaderMaterial {
  declare uniforms: LightingMaskMaterialUniforms

  constructor() {
    super({
      name: 'LightingMaskMaterial',
      glslVersion: GLSL3,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: { depth }
      }),
      vertexShader,
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        inputBuffer: new Uniform(null),
        depthBuffer0: new Uniform(null),
        depthBuffer1: new Uniform(null),
        cameraNear: new Uniform(0),
        cameraFar: new Uniform(0),
        inverted: new Uniform(false)
      } satisfies LightingMaskMaterialUniforms
    })
  }

  copyCameraSettings(camera: Camera): void {
    this.perspectiveCamera = camera.isPerspectiveCamera === true
    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    const uniforms = this.uniforms
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  get depthBuffer0(): Texture | null {
    return this.uniforms.depthBuffer0.value
  }

  set depthBuffer0(value: Texture | null) {
    this.uniforms.depthBuffer0.value = value
  }

  get depthBuffer1(): Texture | null {
    return this.uniforms.depthBuffer1.value
  }

  set depthBuffer1(value: Texture | null) {
    this.uniforms.depthBuffer1.value = value
  }

  /** @private */
  @define('PERSPECTIVE_CAMERA')
  perspectiveCamera = false

  @defineInt('DEPTH_PACKING_0')
  depthPacking0: DepthPackingStrategies = RGBADepthPacking

  @defineInt('DEPTH_PACKING_1')
  depthPacking1: DepthPackingStrategies = RGBADepthPacking
}
