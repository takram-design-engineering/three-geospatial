import {
  Color,
  GLSL3,
  Matrix4,
  Uniform,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type Scene,
  type Texture,
  type WebGLRenderer
} from 'three'

import { define, resolveIncludes } from '@takram/three-geospatial'
import { raySphereIntersection } from '@takram/three-geospatial/shaders'

import {
  AtmosphereMaterialBase,
  atmosphereMaterialParametersBaseDefaults,
  type AtmosphereMaterialBaseParameters,
  type AtmosphereMaterialBaseUniforms
} from './AtmosphereMaterialBase'
import type { AtmosphereShadowLength } from './types'

import common from './shaders/bruneton/common.glsl?raw'
import definitions from './shaders/bruneton/definitions.glsl?raw'
import runtime from './shaders/bruneton/runtime.glsl?raw'
import fragmentShader from './shaders/sky.frag?raw'
import sky from './shaders/sky.glsl?raw'
import vertexShader from './shaders/sky.vert?raw'

export interface SkyMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
  ground?: boolean
  groundAlbedo?: Color
}

export const skyMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1,
  ground: true,
  groundAlbedo: new Color(0)
} satisfies SkyMaterialParameters

export interface SkyMaterialUniforms {
  [key: string]: Uniform<unknown>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  moonDirection: Uniform<Vector3>
  moonAngularRadius: Uniform<number>
  lunarRadianceScale: Uniform<number>
  groundAlbedo: Uniform<Color>
  shadowLengthBuffer: Uniform<Texture | null>
}

export class SkyMaterial extends AtmosphereMaterialBase {
  declare uniforms: AtmosphereMaterialBaseUniforms & SkyMaterialUniforms

  shadowLength: AtmosphereShadowLength | null = null

  constructor(params?: SkyMaterialParameters) {
    const {
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ground,
      groundAlbedo,
      ...others
    } = { ...skyMaterialParametersDefaults, ...params }

    super({
      name: 'SkyMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: { raySphereIntersection },
        bruneton: {
          common,
          definitions,
          runtime
        },
        sky
      }),
      ...others,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
        moonAngularRadius: new Uniform(moonAngularRadius),
        lunarRadianceScale: new Uniform(lunarRadianceScale),
        groundAlbedo: new Uniform(groundAlbedo.clone()),
        shadowLengthBuffer: new Uniform(null),
        ...others.uniforms
      } satisfies SkyMaterialUniforms,
      defines: {
        PERSPECTIVE_CAMERA: '1'
      },
      depthTest: true
    })
    this.sun = sun
    this.moon = moon
    this.ground = ground
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

    const { uniforms, defines } = this
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)

    const prevPerspectiveCamera = defines.PERSPECTIVE_CAMERA != null
    const nextPerspectiveCamera = camera.isPerspectiveCamera === true
    if (nextPerspectiveCamera !== prevPerspectiveCamera) {
      if (nextPerspectiveCamera) {
        defines.PERSPECTIVE_CAMERA = '1'
      } else {
        delete defines.PERSPECTIVE_CAMERA
      }
      this.needsUpdate = true
    }

    const color = this.groundAlbedo
    const prevGroundAlbedo = defines.GROUND_ALBEDO != null
    const nextGroundAlbedo = color.r !== 0 || color.g !== 0 || color.b !== 0
    if (nextGroundAlbedo !== prevGroundAlbedo) {
      if (nextGroundAlbedo) {
        this.defines.GROUND_ALBEDO = '1'
      } else {
        delete this.defines.GROUND_ALBEDO
      }
      this.needsUpdate = true
    }

    const shadowLength = this.shadowLength
    const prevShadowLength = defines.HAS_SHADOW_LENGTH != null
    const nextShadowLength = shadowLength != null
    if (nextShadowLength !== prevShadowLength) {
      if (nextShadowLength) {
        defines.HAS_SHADOW_LENGTH = '1'
      } else {
        delete defines.HAS_SHADOW_LENGTH
        uniforms.shadowLengthBuffer.value = null
      }
      this.needsUpdate = true
    }
    if (nextShadowLength) {
      uniforms.shadowLengthBuffer.value = shadowLength.map
    }
  }

  @define('SUN')
  sun: boolean

  @define('MOON')
  moon: boolean

  @define('GROUND')
  ground: boolean

  get moonDirection(): Vector3 {
    return this.uniforms.moonDirection.value
  }

  get moonAngularRadius(): number {
    return this.uniforms.moonAngularRadius.value
  }

  set moonAngularRadius(value: number) {
    this.uniforms.moonAngularRadius.value = value
  }

  get lunarRadianceScale(): number {
    return this.uniforms.lunarRadianceScale.value
  }

  set lunarRadianceScale(value: number) {
    this.uniforms.lunarRadianceScale.value = value
  }

  get groundAlbedo(): Color {
    return this.uniforms.groundAlbedo.value
  }
}
