import {
  BufferGeometry,
  Camera,
  Data3DTexture,
  DepthPackingStrategies,
  GLSL3,
  Group,
  Matrix4,
  NoBlending,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  RawShaderMaterial,
  RGBADepthPacking,
  Scene,
  Texture,
  Uniform,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three'

import {
  assertType,
  define,
  defineInt,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import {
  cascadedShadow,
  depth,
  screenSpaceRaycast,
  transform
} from '@takram/three-geospatial/shaders'

import type { AtmosphereSceneShadow } from './types'

import fragmentShader from './shaders/screenSpaceShadowMaterial.frag?raw'
import vertexShader from './shaders/screenSpaceShadowMaterial.vert?raw'

export interface ScreenSpaceShadowMaterialUniforms {
  [key: string]: Uniform<unknown>
  depthBuffer: Uniform<Texture | null>
  normalBuffer: Uniform<Texture | null>
  projectionMatrix: Uniform<Matrix4>
  inverseProjectionMatrix: Uniform<Matrix4>
  viewMatrix: Uniform<Matrix4>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  texelSize: Uniform<Vector2>
  sunDirection: Uniform<Vector3>
  stbnTexture: Uniform<Data3DTexture | null>
  frame: Uniform<number>

  // Configurations
  maxIterationCount: Uniform<number>
  maxBinarySearchIterationCount: Uniform<number>
  thickness: Uniform<number>
  stepSize: Uniform<number> // In pixels
  minStepSize: Uniform<number> // In pixels
  // The step size will be "minStepSize" for the ray starting at this distance.
  minStepSizeDistance: Uniform<number>
  maxRayDistance: Uniform<number>
  normalBias: Uniform<number>

  // Blending with scene shadow
  sceneShadow: Uniform<{
    cascadeCount: number
    intervals: Vector2[]
    far: number
  }>
}

export class ScreenSpaceShadowMaterial extends RawShaderMaterial {
  declare uniforms: ScreenSpaceShadowMaterialUniforms

  sceneShadow: AtmosphereSceneShadow | null = null

  constructor() {
    super({
      name: 'ScreenSpaceShadowMaterial',
      glslVersion: GLSL3,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          core: {
            cascadedShadow,
            depth,
            screenSpaceRaycast,
            transform
          }
        })
      ),
      vertexShader,
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        depthBuffer: new Uniform(null),
        normalBuffer: new Uniform(null),
        projectionMatrix: new Uniform(new Matrix4()),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        viewMatrix: new Uniform(new Matrix4()),
        cameraNear: new Uniform(0),
        cameraFar: new Uniform(0),
        texelSize: new Uniform(new Vector2()),
        sunDirection: new Uniform(new Vector3()),
        stbnTexture: new Uniform(null),
        frame: new Uniform(0),

        // Configurations
        maxIterationCount: new Uniform(256),
        maxBinarySearchIterationCount: new Uniform(4),
        thickness: new Uniform(100),
        stepSize: new Uniform(16),
        minStepSize: new Uniform(4),
        minStepSizeDistance: new Uniform(5000),
        maxRayDistance: new Uniform(10000),
        normalBias: new Uniform(0.001),

        // Blending with scene shadow
        sceneShadow: new Uniform({
          cascadeCount: 0,
          intervals: [],
          far: 0
        })
      } satisfies ScreenSpaceShadowMaterialUniforms
    })
  }

  copyCameraSettings(camera: Camera): void {
    const uniforms = this.uniforms
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)

    this._perspectiveCamera = camera.isPerspectiveCamera === true
    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far
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
    this._logarithmicDepthBuffer = renderer.capabilities.logarithmicDepthBuffer

    const { uniforms, defines, sceneShadow } = this
    const prevValue = defines.HAS_SCENE_SHADOW != null
    const nextValue = sceneShadow != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.HAS_SCENE_SHADOW = '1'
      } else {
        delete defines.HAS_SCENE_SHADOW
      }
      this.needsUpdate = true
    }
    if (nextValue) {
      const uniform = uniforms.sceneShadow.value
      uniform.cascadeCount = sceneShadow.cascadeCount
      uniform.intervals = sceneShadow.intervals
      uniform.far = sceneShadow.far
    }
  }

  get depthBuffer(): Texture | null {
    return this.uniforms.depthBuffer.value
  }

  set depthBuffer(value: Texture | null) {
    this.uniforms.depthBuffer.value = value
  }

  /** @private */
  @define('PERSPECTIVE_CAMERA')
  _perspectiveCamera = false

  /** @private */
  @define('USE_LOGDEPTHBUF')
  _logarithmicDepthBuffer = false

  @defineInt('DEPTH_PACKING')
  depthPacking: DepthPackingStrategies = RGBADepthPacking

  @define('RECONSTRUCT_NORMAL')
  reconstructNormal = false
}
