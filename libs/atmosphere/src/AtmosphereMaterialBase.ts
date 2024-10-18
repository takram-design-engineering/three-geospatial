import {
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

import { Ellipsoid, Geodetic } from '@geovanni/core'

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

const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface AtmosphereMaterialBaseParameters
  extends Partial<ShaderMaterialParameters> {
  irradianceTexture?: Texture | null
  scatteringTexture?: Texture | null
  transmittanceTexture?: Texture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  photometric?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
}

export const atmosphereMaterialParametersBaseDefaults = {
  useHalfFloat: false,
  ellipsoid: Ellipsoid.WGS84,
  photometric: false
} satisfies AtmosphereMaterialBaseParameters

export abstract class AtmosphereMaterialBase extends RawShaderMaterial {
  constructor(params?: AtmosphereMaterialBaseParameters) {
    const {
      irradianceTexture,
      scatteringTexture,
      transmittanceTexture,
      useHalfFloat,
      ellipsoid,
      photometric,
      sunDirection,
      sunAngularRadius,
      ...others
    } = { ...atmosphereMaterialParametersBaseDefaults, ...params }

    super({
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others,
      // prettier-ignore
      uniforms: {
        u_solar_irradiance: new Uniform(ATMOSPHERE_PARAMETERS.solarIrradiance),
        u_sun_angular_radius: new Uniform(sunAngularRadius ?? ATMOSPHERE_PARAMETERS.sunAngularRadius),
        u_bottom_radius: new Uniform(ATMOSPHERE_PARAMETERS.bottomRadius),
        u_top_radius: new Uniform(ATMOSPHERE_PARAMETERS.topRadius),
        u_rayleigh_scattering: new Uniform(ATMOSPHERE_PARAMETERS.rayleighScattering),
        u_mie_scattering: new Uniform(ATMOSPHERE_PARAMETERS.mieScattering),
        u_mie_phase_function_g: new Uniform(ATMOSPHERE_PARAMETERS.miePhaseFunctionG),
        u_mu_s_min: new Uniform(0),
        u_irradiance_texture: new Uniform(irradianceTexture),
        u_scattering_texture: new Uniform(scatteringTexture),
        u_single_mie_scattering_texture: new Uniform(scatteringTexture),
        u_transmittance_texture: new Uniform(transmittanceTexture),
        cameraPosition: new Uniform(new Vector3()),
        cameraHeight: new Uniform(0),
        ellipsoidRadii: new Uniform(new Vector3().copy(ellipsoid.radii)),
        geodeticSurface: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
        ...others.uniforms,
      },
      // prettier-ignore
      defines: {
        PI: `${Math.PI}`,
        TRANSMITTANCE_TEXTURE_WIDTH: `${TRANSMITTANCE_TEXTURE_WIDTH}`,
        TRANSMITTANCE_TEXTURE_HEIGHT: `${TRANSMITTANCE_TEXTURE_HEIGHT}`,
        SCATTERING_TEXTURE_R_SIZE: `${SCATTERING_TEXTURE_R_SIZE}`,
        SCATTERING_TEXTURE_MU_SIZE: `${SCATTERING_TEXTURE_MU_SIZE}`,
        SCATTERING_TEXTURE_MU_S_SIZE: `${SCATTERING_TEXTURE_MU_S_SIZE}`,
        SCATTERING_TEXTURE_NU_SIZE: `${SCATTERING_TEXTURE_NU_SIZE}`,
        IRRADIANCE_TEXTURE_WIDTH: `${IRRADIANCE_TEXTURE_WIDTH}`,
        IRRADIANCE_TEXTURE_HEIGHT: `${IRRADIANCE_TEXTURE_HEIGHT}`,
        METER_TO_UNIT_LENGTH: `float(${METER_TO_UNIT_LENGTH})`,
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${SKY_SPECTRAL_RADIANCE_TO_LUMINANCE.toArray().join(',')})`,
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${SUN_SPECTRAL_RADIANCE_TO_LUMINANCE.toArray().join(',')})`,
        ...others.defines
      }
    })
    this.useHalfFloat = useHalfFloat
    this.photometric = photometric
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
    const position = camera.getWorldPosition(uniforms.cameraPosition.value)
    const geodetic = geodeticScratch.setFromECEF(position)
    uniforms.cameraHeight.value = geodetic.height
    geodetic.setHeight(0).toECEF(uniforms.geodeticSurface.value)
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

  get useHalfFloat(): boolean {
    return (
      this.uniforms.u_mu_s_min.value === ATMOSPHERE_PARAMETERS.muSMinHalfFloat
    )
  }

  set useHalfFloat(value: boolean) {
    this.uniforms.u_mu_s_min.value = value
      ? ATMOSPHERE_PARAMETERS.muSMinHalfFloat
      : ATMOSPHERE_PARAMETERS.muSMinFloat
  }

  get photometric(): boolean {
    return this.defines.PHOTOMETRIC != null
  }

  set photometric(value: boolean) {
    if (value !== this.photometric) {
      if (value) {
        this.defines.PHOTOMETRIC = '1'
      } else {
        delete this.defines.PHOTOMETRIC
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
}
