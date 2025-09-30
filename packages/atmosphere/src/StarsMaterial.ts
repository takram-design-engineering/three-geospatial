import {
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  type BufferGeometry,
  type Group,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer
} from 'three'

import { define, resolveIncludes } from '@takram/three-geospatial'

import {
  AtmosphereMaterialBase,
  atmosphereMaterialParametersBaseDefaults,
  type AtmosphereMaterialBaseParameters,
  type AtmosphereMaterialBaseUniforms
} from './AtmosphereMaterialBase'

import common from './shaders/bruneton/common.glsl?raw'
import definitions from './shaders/bruneton/definitions.glsl?raw'
import runtime from './shaders/bruneton/runtime.glsl?raw'
import fragmentShader from './shaders/stars.frag?raw'
import vertexShader from './shaders/stars.vert?raw'

export interface StarsMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  pointSize?: number
  /** @deprecated Use intensity instead. */
  radianceScale?: number
  intensity?: number
  background?: boolean
  ground?: boolean
}

export const starsMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults,
  pointSize: 1,
  intensity: 1,
  background: true,
  ground: true
} satisfies StarsMaterialParameters

export interface StarsMaterialUniforms {
  [key: string]: Uniform<unknown>
  projectionMatrix: Uniform<Matrix4>
  modelViewMatrix: Uniform<Matrix4>
  viewMatrix: Uniform<Matrix4>
  matrixWorld: Uniform<Matrix4>
  cameraFar: Uniform<number>
  pointSize: Uniform<number>
  magnitudeRange: Uniform<Vector2>
  intensity: Uniform<number>
}

export class StarsMaterial extends AtmosphereMaterialBase {
  declare uniforms: AtmosphereMaterialBaseUniforms & StarsMaterialUniforms

  pointSize: number

  constructor(params?: StarsMaterialParameters) {
    const {
      pointSize,
      radianceScale,
      intensity,
      background,
      ground,
      ...others
    } = {
      ...starsMaterialParametersDefaults,
      ...params
    }

    super({
      name: 'StarsMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(fragmentShader, {
        bruneton: {
          common,
          definitions,
          runtime
        }
      }),
      ...others,
      uniforms: {
        projectionMatrix: new Uniform(new Matrix4()),
        modelViewMatrix: new Uniform(new Matrix4()),
        viewMatrix: new Uniform(new Matrix4()),
        matrixWorld: new Uniform(new Matrix4()),
        cameraFar: new Uniform(0),
        pointSize: new Uniform(0),
        magnitudeRange: new Uniform(new Vector2(-2, 8)),
        intensity: new Uniform(radianceScale ?? intensity),
        ...others.uniforms
      } satisfies StarsMaterialUniforms,
      defines: {
        PERSPECTIVE_CAMERA: '1'
      }
    })
    this.pointSize = pointSize
    this.background = background
    this.ground = ground
  }

  override onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: PerspectiveCamera | OrthographicCamera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    super.onBeforeRender(renderer, scene, camera, geometry, object, group)
    const uniforms = this.uniforms
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.modelViewMatrix.value.copy(camera.modelViewMatrix)
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)
    uniforms.matrixWorld.value.copy(object.matrixWorld)
    uniforms.cameraFar.value = camera.far
    uniforms.pointSize.value = this.pointSize * renderer.getPixelRatio()

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

  get magnitudeRange(): Vector2 {
    return this.uniforms.magnitudeRange.value
  }

  /** @deprecated Use intensity instead. */
  get radianceScale(): number {
    return this.intensity
  }

  /** @deprecated Use intensity instead. */
  set radianceScale(value: number) {
    this.intensity = value
  }

  get intensity(): number {
    return this.uniforms.intensity.value
  }

  set intensity(value: number) {
    this.uniforms.intensity.value = value
  }

  @define('BACKGROUND')
  background: boolean

  @define('GROUND')
  ground: boolean
}
