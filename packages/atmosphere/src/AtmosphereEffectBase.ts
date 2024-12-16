/* eslint-disable @typescript-eslint/no-non-null-assertion */

import {
  BlendFunction,
  Effect,
  type EffectAttribute,
  type WebGLExtension
} from 'postprocessing'
import {
  Camera,
  Matrix4,
  Uniform,
  Vector3,
  type Data3DTexture,
  type DataTexture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import { Ellipsoid, Geodetic } from '@takram/three-geospatial'

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

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

interface EffectOptions {
  attributes?: EffectAttribute
  blendFunction?: BlendFunction
  defines?: Map<string, string>
  uniforms?: Map<string, Uniform>
  extensions?: Set<WebGLExtension>
  vertexShader?: string
}

export interface AtmosphereEffectBaseOptions extends EffectOptions {
  irradianceTexture?: DataTexture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: DataTexture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  sunDirection?: Vector3
}

export const atmosphereEffectBaseOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  useHalfFloat: true,
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  photometric: true
} satisfies AtmosphereEffectBaseOptions

export abstract class AtmosphereEffectBase extends Effect {
  protected readonly atmosphere: AtmosphereParameters
  private _ellipsoid!: Ellipsoid
  correctAltitude: boolean

  constructor(
    name: string,
    fragmentShader: string,
    protected camera = new Camera(),
    options?: AtmosphereEffectBaseOptions,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const {
      irradianceTexture = null,
      scatteringTexture = null,
      transmittanceTexture = null,
      useHalfFloat,
      ellipsoid,
      correctAltitude,
      photometric,
      sunDirection,
      ...others
    } = { ...atmosphereEffectBaseOptionsDefaults, ...options }

    super(name, fragmentShader, {
      ...others,
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
        ['projectionMatrix', new Uniform(new Matrix4())],
        ['inverseProjectionMatrix', new Uniform(new Matrix4())],
        ['inverseViewMatrix', new Uniform(new Matrix4())],
        ['cameraPosition', new Uniform(new Vector3())],
        ['cameraHeight', new Uniform(0)],
        ['ellipsoidCenter', new Uniform(new Vector3())],
        ['ellipsoidRadii', new Uniform(new Vector3())],
        ['sunDirection', new Uniform(sunDirection?.clone() ?? new Vector3())],
        ...(others.uniforms != null ? Array.from(others.uniforms?.entries()) : [])
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
        ...(others.defines != null ? Array.from(others.defines?.entries()) : [])
      ])
    })

    this.camera = camera
    this.atmosphere = atmosphere
    this.useHalfFloat = useHalfFloat
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.photometric = photometric
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
    try {
      cameraHeight.value = geodeticScratch.setFromECEF(position).height
    } catch (error) {
      return // Abort when the position is zero.
    }

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
          // TODO: Too many duplicated codes.
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
}
