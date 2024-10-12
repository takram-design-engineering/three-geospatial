/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Matrix4,
  Uniform,
  Vector3,
  type Camera,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { Ellipsoid, Geodetic } from '@geovanni/core'

import { ATMOSPHERE_PARAMETERS, METER_TO_UNIT_LENGTH } from './constants'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag'
import vertexShader from './shaders/aerialPerspectiveEffect.vert'
import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import vertexCommon from './shaders/vertexCommon.glsl'

const geodeticScratch = new Geodetic()

export interface AerialPerspectiveEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  reconstructNormal?: boolean
  irradianceTexture?: Texture | null
  scatteringTexture?: Texture | null
  transmittanceTexture?: Texture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  sunIrradiance?: boolean
  skyIrradiance?: boolean
  transmittance?: boolean
  inscatter?: boolean
  inputIntensity?: number
}

export const aerialPerspectiveEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  reconstructNormal: false,
  ellipsoid: Ellipsoid.WGS84,
  sunIrradiance: true,
  skyIrradiance: true,
  transmittance: true,
  inscatter: true,
  inputIntensity: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends Effect {
  constructor(
    private camera: Camera,
    options?: AerialPerspectiveEffectOptions
  ) {
    const {
      blendFunction,
      normalBuffer,
      reconstructNormal,
      irradianceTexture,
      scatteringTexture,
      transmittanceTexture,
      useHalfFloat,
      ellipsoid,
      sunIrradiance,
      skyIrradiance,
      transmittance,
      inscatter,
      inputIntensity
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    super(
      'AerialPerspectiveEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${fragmentShader}
      `,
      {
        blendFunction,
        vertexShader: /* glsl */ `
          ${parameters}
          ${vertexCommon}
          ${vertexShader}
        `,
        attributes: EffectAttribute.DEPTH,
        // prettier-ignore
        uniforms: new Map<string, Uniform>([
          ['u_solar_irradiance', new Uniform(ATMOSPHERE_PARAMETERS.solarIrradiance)],
          ['u_sun_angular_radius', new Uniform(ATMOSPHERE_PARAMETERS.sunAngularRadius)],
          ['u_bottom_radius', new Uniform(ATMOSPHERE_PARAMETERS.bottomRadius)],
          ['u_top_radius', new Uniform(ATMOSPHERE_PARAMETERS.topRadius)],
          ['u_rayleigh_scattering', new Uniform(ATMOSPHERE_PARAMETERS.rayleighScattering)],
          ['u_mie_scattering', new Uniform(ATMOSPHERE_PARAMETERS.mieScattering)],
          ['u_mie_phase_function_g', new Uniform(ATMOSPHERE_PARAMETERS.miePhaseFunctionG)],
          ['u_mu_s_min', new Uniform(0)],
          ['u_irradiance_texture', new Uniform(irradianceTexture)],
          ['u_scattering_texture', new Uniform(scatteringTexture)],
          ['u_single_mie_scattering_texture', new Uniform(scatteringTexture)],
          ['u_transmittance_texture', new Uniform(transmittanceTexture)],
          ['normalBuffer', new Uniform(normalBuffer)],
          ['projectionMatrix', new Uniform(new Matrix4())],
          ['inverseProjectionMatrix', new Uniform(new Matrix4())],
          ['inverseViewMatrix', new Uniform(new Matrix4())],
          ['cameraPosition', new Uniform(new Vector3())],
          ['cameraHeight', new Uniform(0)],
          ['ellipsoidRadii', new Uniform(new Vector3().copy(ellipsoid.radii))],
          ['geodeticSurface', new Uniform(new Vector3())],
          ['sunDirection', new Uniform(new Vector3())],
          ['inputIntensity', new Uniform(inputIntensity)]
        ]),
        defines: new Map<string, string>([
          ['METER_TO_UNIT_LENGTH', `float(${METER_TO_UNIT_LENGTH})`],
          ['SUN_IRRADIANCE', '1'],
          ['SKY_IRRADIANCE', '1'],
          ['TRANSMITTANCE', '1'],
          ['INSCATTER', '1']
        ])
      }
    )
    this.camera = camera
    this.reconstructNormal = reconstructNormal
    this.useHalfFloat = useHalfFloat === true
    this.sunIrradiance = sunIrradiance
    this.skyIrradiance = skyIrradiance
    this.transmittance = transmittance
    this.inscatter = inscatter
  }

  get mainCamera(): Camera {
    return this.camera
  }

  override set mainCamera(value: Camera) {
    this.camera = value
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    if (renderer.capabilities.logarithmicDepthBuffer) {
      this.defines.set('LOG_DEPTH', '1')
    } else {
      this.defines.delete('LOG_DEPTH')
    }
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    if (this.camera == null) {
      return
    }
    const uniforms = this.uniforms
    const projectionMatrix = uniforms.get('projectionMatrix')!
    const inverseProjectionMatrix = uniforms.get('inverseProjectionMatrix')!
    const inverseViewMatrix = uniforms.get('inverseViewMatrix')!
    const cameraPosition = uniforms.get('cameraPosition')!
    const cameraHeight = uniforms.get('cameraHeight')!
    const geodeticSurface = uniforms.get('geodeticSurface')!
    const camera = this.camera
    projectionMatrix.value.copy(camera.projectionMatrix)
    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    inverseViewMatrix.value.copy(camera.matrixWorld)
    const position = camera.getWorldPosition(cameraPosition.value)
    const geodetic = geodeticScratch.setFromECEF(position)
    cameraHeight.value = geodetic.height
    geodetic.setHeight(0).toECEF(geodeticSurface.value)
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get reconstructNormal(): boolean {
    return this.defines.has('RECONSTRUCT_NORMAL')
  }

  set reconstructNormal(value: boolean) {
    if (value !== this.reconstructNormal) {
      if (value) {
        this.defines.set('RECONSTRUCT_NORMAL', '1')
      } else {
        this.defines.delete('RECONSTRUCT_NORMAL')
      }
      this.setChanged()
    }
  }

  get irradianceTexture(): Texture | null {
    return this.uniforms.get('u_irradiance_texture')!.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.get('u_irradiance_texture')!.value = value
  }

  get scatteringTexture(): Texture | null {
    return this.uniforms.get('u_scattering_texture')!.value
  }

  set scatteringTexture(value: Texture | null) {
    this.uniforms.get('u_scattering_texture')!.value = value
    this.uniforms.get('u_single_mie_scattering_texture')!.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.get('u_transmittance_texture')!.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.get('u_transmittance_texture')!.value = value
  }

  get useHalfFloat(): boolean {
    return (
      this.uniforms.get('u_mu_s_min')!.value ===
      ATMOSPHERE_PARAMETERS.muSMinHalfFloat
    )
  }

  set useHalfFloat(value: boolean) {
    this.uniforms.get('u_mu_s_min')!.value = value
      ? ATMOSPHERE_PARAMETERS.muSMinHalfFloat
      : ATMOSPHERE_PARAMETERS.muSMinFloat
  }

  get sunDirection(): Vector3 {
    return this.uniforms.get('sunDirection')!.value
  }

  set sunDirection(value: Vector3) {
    this.uniforms.get('sunDirection')!.value.copy(value)
  }

  get inputIntensity(): number {
    return this.uniforms.get('inputIntensity')!.value
  }

  set inputIntensity(value: number) {
    this.uniforms.get('inputIntensity')!.value = value
  }

  get sunIrradiance(): boolean {
    return this.defines.has('SUN_IRRADIANCE')
  }

  set sunIrradiance(value: boolean) {
    if (value !== this.sunIrradiance) {
      if (value) {
        this.defines.set('SUN_IRRADIANCE', '1')
      } else {
        this.defines.delete('SUN_IRRADIANCE')
      }
      this.setChanged()
    }
  }

  get skyIrradiance(): boolean {
    return this.defines.has('SKY_IRRADIANCE')
  }

  set skyIrradiance(value: boolean) {
    if (value !== this.skyIrradiance) {
      if (value) {
        this.defines.set('SKY_IRRADIANCE', '1')
      } else {
        this.defines.delete('SKY_IRRADIANCE')
      }
      this.setChanged()
    }
  }

  get transmittance(): boolean {
    return this.defines.has('TRANSMITTANCE')
  }

  set transmittance(value: boolean) {
    if (value !== this.transmittance) {
      if (value) {
        this.defines.set('TRANSMITTANCE', '1')
      } else {
        this.defines.delete('TRANSMITTANCE')
      }
      this.setChanged()
    }
  }

  get inscatter(): boolean {
    return this.defines.has('INSCATTER')
  }

  set inscatter(value: boolean) {
    if (value !== this.inscatter) {
      if (value) {
        this.defines.set('INSCATTER', '1')
      } else {
        this.defines.delete('INSCATTER')
      }
      this.setChanged()
    }
  }
}
