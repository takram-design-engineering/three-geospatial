/// <reference types="vite-plugin-glsl/ext" />

import {
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type Scene,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLRenderer
} from 'three'

import { Cartographic, Ellipsoid } from '@geovanni/core'

import { ATMOSPHERE_PARAMETERS, METER_TO_UNIT_LENGTH } from './constants'

import fragmentShader from './shaders/atmosphere.frag'
import vertexShader from './shaders/atmosphere.vert'
import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import vertexCommon from './shaders/vertexCommon.glsl'

const cartographicScratch = new Cartographic()

export interface AtmosphereMaterialParameters
  extends Partial<ShaderMaterialParameters> {
  irradianceTexture?: Texture | null
  scatteringTexture?: Texture | null
  transmittanceTexture?: Texture | null
  ellipsoid?: Ellipsoid
  sun?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const atmosphereMaterialParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1
} satisfies AtmosphereMaterialParameters

export class AtmosphereMaterial extends RawShaderMaterial {
  constructor(params?: AtmosphereMaterialParameters) {
    const {
      irradianceTexture,
      scatteringTexture,
      transmittanceTexture,
      ellipsoid,
      sun,
      sunDirection,
      sunAngularRadius,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ...others
    } = { ...atmosphereMaterialParametersDefaults, ...params }

    super({
      vertexShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${vertexCommon}
        ${vertexShader}
      `,
      ...others,
      glslVersion: '300 es',
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp sampler3D;
        ${parameters}
        ${functions}
        ${fragmentShader}
      `,
      // prettier-ignore
      uniforms: {
        u_solar_irradiance: new Uniform(ATMOSPHERE_PARAMETERS.solarIrradiance),
        u_sun_angular_radius: new Uniform(sunAngularRadius ?? ATMOSPHERE_PARAMETERS.sunAngularRadius),
        u_bottom_radius: new Uniform(ATMOSPHERE_PARAMETERS.bottomRadius),
        u_top_radius: new Uniform(ATMOSPHERE_PARAMETERS.topRadius),
        u_rayleigh_scattering: new Uniform(ATMOSPHERE_PARAMETERS.rayleighScattering),
        u_mie_scattering: new Uniform(ATMOSPHERE_PARAMETERS.mieScattering),
        u_mie_phase_function_g: new Uniform(ATMOSPHERE_PARAMETERS.miePhaseFunctionG),
        u_mu_s_min: new Uniform(ATMOSPHERE_PARAMETERS.muSMin),
        u_irradiance_texture: new Uniform(irradianceTexture),
        u_scattering_texture: new Uniform(scatteringTexture),
        u_single_mie_scattering_texture: new Uniform(scatteringTexture),
        u_transmittance_texture: new Uniform(transmittanceTexture),
        projectionMatrix: new Uniform(new Matrix4()),
        modelViewMatrix: new Uniform(new Matrix4()),
        modelMatrix: new Uniform(new Matrix4()),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4()),
        cameraPosition: new Uniform(new Vector3()),
        cameraHeight: new Uniform(0),
        ellipsoidRadii: new Uniform(new Vector3().copy(ellipsoid.radii)),
        ellipsoidSurface: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
        moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
        moonAngularRadius: new Uniform(moonAngularRadius),
        lunarRadianceScale: new Uniform(lunarRadianceScale)
      },
      defines: {
        METER_TO_UNIT_LENGTH: `float(${METER_TO_UNIT_LENGTH})`,
        SUN: '1',
        MOON: '1'
      },
      toneMapped: false,
      depthWrite: false,
      depthTest: false
    })
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
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.modelViewMatrix.value.copy(scene.modelViewMatrix)
    uniforms.modelMatrix.value.copy(object.matrixWorld)
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)
    const position = camera.getWorldPosition(uniforms.cameraPosition.value)
    const cartographic = cartographicScratch.setFromVector(position)
    uniforms.cameraHeight.value = cartographic.height
    cartographic.setHeight(0).toVector(uniforms.ellipsoidSurface.value)
  }

  get irradianceTexture(): Texture | null {
    return this.uniforms.u_irradiance_texture.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.u_irradiance_texture.value = value
  }

  get scatteringTexture(): Texture | null {
    return this.uniforms.u_scattering_texture.value
  }

  set scatteringTexture(value: Texture | null) {
    this.uniforms.u_scattering_texture.value = value
    this.uniforms.u_single_mie_scattering_texture.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.u_transmittance_texture.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.u_transmittance_texture.value = value
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

  get sunDirection(): Vector3 {
    return this.uniforms.sunDirection.value
  }

  set sunDirection(value: Vector3) {
    this.uniforms.sunDirection.value.copy(value)
  }

  get sunAngularRadius(): number {
    return this.uniforms.u_sun_angular_radius.value
  }

  set sunAngularRadius(value: number) {
    this.uniforms.u_sun_angular_radius.value = value
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

  set moonDirection(value: Vector3) {
    this.uniforms.moonDirection.value.copy(value)
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
}
