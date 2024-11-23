/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type Data3DTexture,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import {
  depthShader,
  Ellipsoid,
  Geodetic,
  packingShader,
  transformShader
} from '@geovanni/core'

import {
  ATMOSPHERE_PARAMETERS,
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  METER_TO_UNIT_LENGTH,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_NU_SIZE,
  SCATTERING_TEXTURE_R_SIZE,
  SKY_SPECTRAL_RADIANCE_TO_LUMINANCE,
  SUN_SPECTRAL_RADIANCE_TO_LUMINANCE,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag'
import vertexShader from './shaders/aerialPerspectiveEffect.vert'
import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface AerialPerspectiveEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  octEncodedNormal?: boolean
  reconstructNormal?: boolean
  irradianceTexture?: DataTexture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: DataTexture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  morphToSphere?: boolean
  photometric?: boolean
  sunDirection?: Vector3
  sunIrradiance?: boolean
  skyIrradiance?: boolean
  transmittance?: boolean
  inscatter?: boolean
  albedoScale?: number
}

export const aerialPerspectiveEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  octEncodedNormal: false,
  reconstructNormal: false,
  ellipsoid: Ellipsoid.WGS84,
  osculateEllipsoid: true,
  morphToSphere: true,
  photometric: true,
  sunIrradiance: true,
  skyIrradiance: true,
  transmittance: true,
  inscatter: true,
  albedoScale: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends Effect {
  private _ellipsoid!: Ellipsoid
  osculateEllipsoid: boolean

  constructor(
    private camera: Camera,
    options?: AerialPerspectiveEffectOptions
  ) {
    const {
      blendFunction,
      normalBuffer = null,
      octEncodedNormal,
      reconstructNormal,
      irradianceTexture = null,
      scatteringTexture = null,
      transmittanceTexture = null,
      useHalfFloat,
      ellipsoid,
      osculateEllipsoid,
      morphToSphere,
      photometric,
      sunDirection,
      sunIrradiance,
      skyIrradiance,
      transmittance,
      inscatter,
      albedoScale
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    super(
      'AerialPerspectiveEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${depthShader}
        ${packingShader}
        ${transformShader}
        ${fragmentShader}
      `,
      {
        blendFunction,
        vertexShader: /* glsl */ `
          ${parameters}
          ${vertexShader}
        `,
        attributes: EffectAttribute.DEPTH,
        // prettier-ignore
        uniforms: new Map<string, Uniform>([
          ['u_solar_irradiance', new Uniform(ATMOSPHERE_PARAMETERS.solarIrradiance)],
          ['u_sun_angular_radius', new Uniform(ATMOSPHERE_PARAMETERS.sunAngularRadius)],
          ['u_bottom_radius', new Uniform(ATMOSPHERE_PARAMETERS.bottomRadius * METER_TO_UNIT_LENGTH)],
          ['u_top_radius', new Uniform(ATMOSPHERE_PARAMETERS.topRadius * METER_TO_UNIT_LENGTH)],
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
          ['ellipsoidCenter', new Uniform(new Vector3())],
          ['ellipsoidRadii', new Uniform(new Vector3())],
          ['ellipsoidInterpolationRange', new Uniform(new Vector2(2e5, 6e5))],
          ['sunDirection', new Uniform(sunDirection?.clone() ?? new Vector3())],
          ['albedoScale', new Uniform(albedoScale)]
        ]),
        // prettier-ignore
        defines: new Map<string, string>([
          ['TRANSMITTANCE_TEXTURE_WIDTH', `${TRANSMITTANCE_TEXTURE_WIDTH}`],
          ['TRANSMITTANCE_TEXTURE_HEIGHT', `${TRANSMITTANCE_TEXTURE_HEIGHT}`],
          ['SCATTERING_TEXTURE_R_SIZE', `${SCATTERING_TEXTURE_R_SIZE}`],
          ['SCATTERING_TEXTURE_MU_SIZE', `${SCATTERING_TEXTURE_MU_SIZE}`],
          ['SCATTERING_TEXTURE_MU_S_SIZE', `${SCATTERING_TEXTURE_MU_S_SIZE}`],
          ['SCATTERING_TEXTURE_NU_SIZE', `${SCATTERING_TEXTURE_NU_SIZE}`],
          ['IRRADIANCE_TEXTURE_WIDTH', `${IRRADIANCE_TEXTURE_WIDTH}`],
          ['IRRADIANCE_TEXTURE_HEIGHT', `${IRRADIANCE_TEXTURE_HEIGHT}`],
          ['METER_TO_UNIT_LENGTH', `float(${METER_TO_UNIT_LENGTH})`],
          ['SUN_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${SUN_SPECTRAL_RADIANCE_TO_LUMINANCE.toArray().join(',')})`],
          ['SKY_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${SKY_SPECTRAL_RADIANCE_TO_LUMINANCE.toArray().join(',')})`],
        ])
      }
    )
    this.camera = camera
    this.octEncodedNormal = octEncodedNormal
    this.reconstructNormal = reconstructNormal
    this.useHalfFloat = useHalfFloat === true
    this.ellipsoid = ellipsoid
    this.osculateEllipsoid = osculateEllipsoid
    this.morphToSphere = morphToSphere
    this.photometric = photometric
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
    const camera = this.camera
    projectionMatrix.value.copy(camera.projectionMatrix)
    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    inverseViewMatrix.value.copy(camera.matrixWorld)

    const cameraPosition = uniforms.get('cameraPosition')!
    const cameraHeight = uniforms.get('cameraHeight')!
    const position = camera.getWorldPosition(cameraPosition.value)
    cameraHeight.value = geodeticScratch.setFromECEF(position).height

    const ellipsoidCenter = uniforms.get('ellipsoidCenter')!
    if (this.osculateEllipsoid) {
      const surfacePosition = this.ellipsoid.projectOnSurface(
        position,
        vectorScratch
      )
      if (surfacePosition != null) {
        this.ellipsoid.getOsculatingSphereCenter(
          surfacePosition,
          ATMOSPHERE_PARAMETERS.bottomRadius,
          ellipsoidCenter.value
        )
      }
    } else {
      ellipsoidCenter.value.set(0, 0, 0)
    }
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer')!.value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer')!.value = value
  }

  get octEncodedNormal(): boolean {
    return this.defines.has('OCT_ENCODED_NORMAL')
  }

  set octEncodedNormal(value: boolean) {
    if (value !== this.octEncodedNormal) {
      if (value) {
        this.defines.set('OCT_ENCODED_NORMAL', '1')
      } else {
        this.defines.delete('OCT_ENCODED_NORMAL')
      }
      this.setChanged()
    }
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

  get irradianceTexture(): DataTexture | null {
    return this.uniforms.get('u_irradiance_texture')!.value
  }

  set irradianceTexture(value: DataTexture | null) {
    this.uniforms.get('u_irradiance_texture')!.value = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('u_scattering_texture')!.value
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('u_scattering_texture')!.value = value
    this.uniforms.get('u_single_mie_scattering_texture')!.value = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.uniforms.get('u_transmittance_texture')!.value
  }

  set transmittanceTexture(value: DataTexture | null) {
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

  get ellipsoid(): Ellipsoid {
    return this._ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this._ellipsoid = value
    this.uniforms.get('ellipsoidRadii')!.value.copy(value.radii)
  }

  get morphToSphere(): boolean {
    return this.defines.has('MORPH_TO_SPHERE')
  }

  set morphToSphere(value: boolean) {
    if (value !== this.morphToSphere) {
      if (value) {
        this.defines.set('MORPH_TO_SPHERE', '1')
      } else {
        this.defines.delete('MORPH_TO_SPHERE')
      }
      this.setChanged()
    }
  }

  get ellipsoidInterpolationRange(): Vector2 {
    return this.uniforms.get('ellipsoidInterpolationRange')!.value
  }

  get photometric(): boolean {
    return this.defines.has('PHOTOMETRIC')
  }

  set photometric(value: boolean) {
    if (value !== this.photometric) {
      if (value) {
        this.defines.set('PHOTOMETRIC', '1')
      } else {
        this.defines.delete('PHOTOMETRIC')
      }
      this.setChanged()
    }
  }

  get sunDirection(): Vector3 {
    return this.uniforms.get('sunDirection')!.value
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

  get albedoScale(): number {
    return this.uniforms.get('albedoScale')!.value
  }

  set albedoScale(value: number) {
    this.uniforms.get('albedoScale')!.value = value
  }
}
