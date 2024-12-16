/* eslint-disable @typescript-eslint/no-non-null-assertion */

/// <reference types="vite-plugin-glsl/ext" />

import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Camera,
  MathUtils,
  Matrix4,
  Uniform,
  Vector3,
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
} from '@takram/three-geospatial'

import { AtmosphereParameters } from './AtmosphereParameters'
import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  METER_TO_UNIT_LENGTH,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_NU_SIZE,
  SCATTERING_TEXTURE_R_SIZE,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag'
import vertexShader from './shaders/aerialPerspectiveEffect.vert'
import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import skyShader from './shaders/sky.glsl'

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
  correctAltitude?: boolean
  correctGeometricError?: boolean
  photometric?: boolean
  sunDirection?: Vector3
  sunIrradiance?: boolean
  skyIrradiance?: boolean
  transmittance?: boolean
  inscatter?: boolean
  irradianceScale?: number
  sky?: boolean
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export const aerialPerspectiveEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  octEncodedNormal: false,
  reconstructNormal: false,
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  correctGeometricError: true,
  photometric: true,
  sunIrradiance: false,
  skyIrradiance: false,
  transmittance: true,
  inscatter: true,
  irradianceScale: 1,
  sky: false,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends Effect {
  private readonly atmosphere: AtmosphereParameters
  private _ellipsoid!: Ellipsoid
  correctAltitude: boolean

  constructor(
    private camera = new Camera(),
    options?: AerialPerspectiveEffectOptions,
    atmosphere = AtmosphereParameters.DEFAULT
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
      correctAltitude,
      correctGeometricError,
      photometric,
      sunDirection,
      sunIrradiance,
      skyIrradiance,
      transmittance,
      inscatter,
      irradianceScale,
      sky,
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    super(
      'AerialPerspectiveEffect',
      /* glsl */ `
        ${parameters}
        ${functions}
        ${depthShader}
        ${packingShader}
        ${transformShader}
        ${skyShader}
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
          ['u_solar_irradiance', new Uniform(atmosphere.solarIrradiance)],
          ['u_sun_angular_radius', new Uniform(atmosphere.sunAngularRadius)],
          ['u_bottom_radius', new Uniform(atmosphere.bottomRadius * METER_TO_UNIT_LENGTH)],
          ['u_top_radius', new Uniform(atmosphere.topRadius * METER_TO_UNIT_LENGTH)],
          ['u_rayleigh_scattering', new Uniform(atmosphere.rayleighScattering)],
          ['u_mie_scattering', new Uniform(atmosphere.mieScattering)],
          ['u_mie_phase_function_g', new Uniform(atmosphere.miePhaseFunctionG)],
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
          ['sunDirection', new Uniform(sunDirection?.clone() ?? new Vector3())],
          ['irradianceScale', new Uniform(irradianceScale)],
          ['idealSphereAlpha', new Uniform(0)],
          ['moonDirection', new Uniform(moonDirection?.clone() ?? new Vector3())],
          ['moonAngularRadius', new Uniform(moonAngularRadius)],
          ['lunarRadianceScale', new Uniform(lunarRadianceScale)]
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
          ['SUN_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${atmosphere.sunRadianceToRelativeLuminance.toArray().join(',')})`],
          ['SKY_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${atmosphere.skyRadianceToRelativeLuminance.toArray().join(',')})`],
        ])
      }
    )

    this.camera = camera
    this.atmosphere = atmosphere
    this.octEncodedNormal = octEncodedNormal
    this.reconstructNormal = reconstructNormal
    this.useHalfFloat = useHalfFloat === true
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.correctGeometricError = correctGeometricError
    this.photometric = photometric
    this.sunIrradiance = sunIrradiance
    this.skyIrradiance = skyIrradiance
    this.transmittance = transmittance
    this.inscatter = inscatter
    this.sky = sky
    this.sun = sun
    this.moon = moon
  }

  get mainCamera(): Camera {
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

    // calculate the projected scale of the globe in clip space used to
    // interpolate between the globe true normals and idealized normals to avoid
    // lighting artifacts
    const idealSphereAlphaUniform = uniforms.get('idealSphereAlpha')!
    vectorScratch
      .set(0, this.ellipsoid.maximumRadius, -cameraHeight.value)
      .applyMatrix4(camera.projectionMatrix)

    // calculate interpolation alpha
    // interpolation values are picked to match previous rough globe scales to
    // match the previous "camera height" approach for interpolation
    // See: https://github.com/takram-design-engineering/three-geospatial/pull/23
    let a = MathUtils.mapLinear(vectorScratch.y, 41.5, 13.8, 0, 1)
    a = MathUtils.clamp(a, 0, 1)
    idealSphereAlphaUniform.value = a

    const ellipsoidCenter = uniforms.get('ellipsoidCenter')!
    if (this.correctAltitude) {
      const surfacePosition = this.ellipsoid.projectOnSurface(
        position,
        vectorScratch
      )
      if (surfacePosition != null) {
        this.ellipsoid.getOsculatingSphereCenter(
          // Move the center of the atmosphere's inner sphere down to intersect
          // the viewpoint when it's located underground.
          surfacePosition.lengthSq() < position.lengthSq()
            ? surfacePosition
            : position,
          this.atmosphere.bottomRadius,
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
      this.uniforms.get('u_mu_s_min')!.value === this.atmosphere.muSMinHalfFloat
    )
  }

  set useHalfFloat(value: boolean) {
    this.uniforms.get('u_mu_s_min')!.value = value
      ? this.atmosphere.muSMinHalfFloat
      : this.atmosphere.muSMinFloat
  }

  get ellipsoid(): Ellipsoid {
    return this._ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this._ellipsoid = value
    this.uniforms.get('ellipsoidRadii')!.value.copy(value.radii)
  }

  get correctGeometricError(): boolean {
    return this.defines.has('CORRECT_GEOMETRIC_ERROR')
  }

  set correctGeometricError(value: boolean) {
    if (value !== this.correctGeometricError) {
      if (value) {
        this.defines.set('CORRECT_GEOMETRIC_ERROR', '1')
      } else {
        this.defines.delete('CORRECT_GEOMETRIC_ERROR')
      }
      this.setChanged()
    }
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

  get irradianceScale(): number {
    return this.uniforms.get('irradianceScale')!.value
  }

  set irradianceScale(value: number) {
    this.uniforms.get('irradianceScale')!.value = value
  }

  get sky(): boolean {
    return this.defines.has('SKY')
  }

  set sky(value: boolean) {
    if (value !== this.sky) {
      if (value) {
        this.defines.set('SKY', '1')
      } else {
        this.defines.delete('SKY')
      }
      this.setChanged()
    }
  }

  get sun(): boolean {
    return this.defines.has('SUN')
  }

  set sun(value: boolean) {
    if (value !== this.sun) {
      if (value) {
        this.defines.set('SUN', '1')
      } else {
        this.defines.delete('SUN')
      }
      this.setChanged()
    }
  }

  get moon(): boolean {
    return this.defines.has('MOON')
  }

  set moon(value: boolean) {
    if (value !== this.moon) {
      if (value) {
        this.defines.set('MOON', '1')
      } else {
        this.defines.delete('MOON')
      }
      this.setChanged()
    }
  }

  get moonDirection(): Vector3 {
    return this.uniforms.get('moonDirection')!.value
  }

  get moonAngularRadius(): number {
    return this.uniforms.get('moonAngularRadius')!.value
  }

  set moonAngularRadius(value: number) {
    this.uniforms.get('moonAngularRadius')!.value = value
  }

  get lunarRadianceScale(): number {
    return this.uniforms.get('lunarRadianceScale')!.value
  }

  set lunarRadianceScale(value: number) {
    this.uniforms.get('lunarRadianceScale')!.value = value
  }
}
