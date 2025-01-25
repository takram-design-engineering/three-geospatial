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
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer
} from 'three'

import { resolveIncludes } from '@takram/three-geospatial'
import { raySphereIntersection } from '@takram/three-geospatial/shaders'

import {
  AtmosphereMaterialBase,
  atmosphereMaterialParametersBaseDefaults,
  type AtmosphereMaterialBaseParameters,
  type AtmosphereMaterialBaseUniforms
} from './AtmosphereMaterialBase'

import functions from './shaders/functions.glsl?raw'
import parameters from './shaders/parameters.glsl?raw'
import fragmentShader from './shaders/sky.frag?raw'
import sky from './shaders/sky.glsl?raw'
import vertexShader from './shaders/sky.vert?raw'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export interface SkyMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
  groundAlbedo?: Color
}

export const skyMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1
} satisfies SkyMaterialParameters

export interface SkyMaterialUniforms {
  [key: string]: Uniform<unknown>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  moonDirection: Uniform<Vector3>
  moonAngularRadius: Uniform<number>
  lunarRadianceScale: Uniform<number>
  groundAlbedo: Uniform<Color>
}

export class SkyMaterial extends AtmosphereMaterialBase {
  declare uniforms: AtmosphereMaterialBaseUniforms & SkyMaterialUniforms

  constructor(params?: SkyMaterialParameters) {
    const {
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      groundAlbedo,
      ...others
    } = { ...skyMaterialParametersDefaults, ...params }

    super({
      name: 'SkyMaterial',
      glslVersion: GLSL3,
      vertexShader: resolveIncludes(vertexShader, {
        parameters
      }),
      fragmentShader: resolveIncludes(fragmentShader, {
        core: { raySphereIntersection },
        parameters,
        functions,
        sky
      }),
      ...others,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
        moonAngularRadius: new Uniform(moonAngularRadius),
        lunarRadianceScale: new Uniform(lunarRadianceScale),
        groundAlbedo: new Uniform(groundAlbedo?.clone() ?? new Color(0)),
        ...others.uniforms
      } satisfies SkyMaterialUniforms,
      defines: {
        PERSPECTIVE_CAMERA: '1'
      },
      depthTest: true
    })
    this.sun = sun
    this.moon = moon
  }

  override onBeforeCompile(
    parameters: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ): void {
    super.onBeforeCompile(parameters, renderer)
    const color = this.groundAlbedo
    const groundAlbedo = color.r !== 0 || color.g !== 0 || color.b !== 0
    if ((this.defines.GROUND_ALBEDO != null) !== groundAlbedo) {
      if (groundAlbedo) {
        this.defines.GROUND_ALBEDO = '1'
      } else {
        delete this.defines.GROUND_ALBEDO
      }
      this.needsUpdate = true
    }
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

  get sun(): boolean {
    return this.defines.SUN != null
  }

  set sun(value: boolean) {
    if (value !== this.sun) {
      if (value) {
        this.defines.SUN = '1'
      } else {
        delete this.defines.SUN
      }
      this.needsUpdate = true
    }
  }

  get moon(): boolean {
    return this.defines.MOON != null
  }

  set moon(value: boolean) {
    if (value !== this.moon) {
      if (value) {
        this.defines.MOON = '1'
      } else {
        delete this.defines.MOON
      }
      this.needsUpdate = true
    }
  }

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
