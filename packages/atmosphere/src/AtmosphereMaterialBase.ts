import {
  RawShaderMaterial,
  Uniform,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Data3DTexture,
  type DataTexture,
  type Group,
  type Object3D,
  type Scene,
  type ShaderMaterialParameters,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer
} from 'three'

import { Ellipsoid } from '@takram/three-geospatial'

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

function includeRenderTargets(fragmentShader: string, count: number): string {
  let layout = ''
  let output = ''
  for (let index = 1; index < count; ++index) {
    layout += `layout(location = ${index}) out float renderTarget${index};\n`
    output += `renderTarget${index} = 0.0;\n`
  }
  return fragmentShader
    .replace('#include <mrt_layout>', layout)
    .replace('#include <mrt_output>', output)
}

export interface AtmosphereMaterialProps {
  irradianceTexture?: DataTexture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: DataTexture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
  renderTargetCount?: number
}

export interface AtmosphereMaterialBaseParameters
  extends Partial<ShaderMaterialParameters>,
    AtmosphereMaterialProps {}

export const atmosphereMaterialParametersBaseDefaults = {
  useHalfFloat: false,
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  photometric: true,
  renderTargetCount: 1
} satisfies AtmosphereMaterialBaseParameters

export abstract class AtmosphereMaterialBase extends RawShaderMaterial {
  private readonly atmosphere: AtmosphereParameters
  ellipsoid: Ellipsoid
  correctAltitude: boolean
  private _renderTargetCount!: number

  constructor(
    params?: AtmosphereMaterialBaseParameters,
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
      sunAngularRadius,
      renderTargetCount,
      ...others
    } = { ...atmosphereMaterialParametersBaseDefaults, ...params }

    super({
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others,
      // prettier-ignore
      uniforms: {
        u_solar_irradiance: new Uniform(atmosphere.solarIrradiance),
        u_sun_angular_radius: new Uniform(sunAngularRadius ?? atmosphere.sunAngularRadius),
        u_bottom_radius: new Uniform(atmosphere.bottomRadius * METER_TO_UNIT_LENGTH),
        u_top_radius: new Uniform(atmosphere.topRadius * METER_TO_UNIT_LENGTH),
        u_rayleigh_scattering: new Uniform(atmosphere.rayleighScattering),
        u_mie_scattering: new Uniform(atmosphere.mieScattering),
        u_mie_phase_function_g: new Uniform(atmosphere.miePhaseFunctionG),
        u_mu_s_min: new Uniform(0),
        u_irradiance_texture: new Uniform(irradianceTexture),
        u_scattering_texture: new Uniform(scatteringTexture),
        u_single_mie_scattering_texture: new Uniform(scatteringTexture),
        u_transmittance_texture: new Uniform(transmittanceTexture),
        cameraPosition: new Uniform(new Vector3()),
        ellipsoidCenter: new Uniform(new Vector3()),
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
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${atmosphere.sunRadianceToRelativeLuminance.toArray().join(',')})`,
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: `vec3(${atmosphere.skyRadianceToRelativeLuminance.toArray().join(',')})`,
        ...others.defines
      }
    })

    this.atmosphere = atmosphere
    this.useHalfFloat = useHalfFloat
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.photometric = photometric
    this.renderTargetCount = renderTargetCount
  }

  override onBeforeCompile(
    parameters: WebGLProgramParametersWithUniforms,
    renderer: WebGLRenderer
  ): void {
    parameters.fragmentShader = includeRenderTargets(
      parameters.fragmentShader,
      this.renderTargetCount
    )
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
          uniforms.ellipsoidCenter.value
        )
      }
    } else {
      uniforms.ellipsoidCenter.value.set(0, 0, 0)
    }
  }

  get irradianceTexture(): DataTexture | null {
    return this.uniforms.u_irradiance_texture.value
  }

  set irradianceTexture(value: DataTexture | null) {
    this.uniforms.u_irradiance_texture.value = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.uniforms.u_scattering_texture.value
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.uniforms.u_scattering_texture.value = value
    this.uniforms.u_single_mie_scattering_texture.value = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.uniforms.u_transmittance_texture.value
  }

  set transmittanceTexture(value: DataTexture | null) {
    this.uniforms.u_transmittance_texture.value = value
  }

  get useHalfFloat(): boolean {
    return this.uniforms.u_mu_s_min.value === this.atmosphere.muSMinHalfFloat
  }

  set useHalfFloat(value: boolean) {
    this.uniforms.u_mu_s_min.value = value
      ? this.atmosphere.muSMinHalfFloat
      : this.atmosphere.muSMinFloat
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

  get sunAngularRadius(): number {
    return this.uniforms.u_sun_angular_radius.value
  }

  set sunAngularRadius(value: number) {
    this.uniforms.u_sun_angular_radius.value = value
  }

  get renderTargetCount(): number {
    return this._renderTargetCount
  }

  set renderTargetCount(value: number) {
    if (value !== this.renderTargetCount) {
      this._renderTargetCount = value
      this.needsUpdate = true
    }
  }
}
