import {
  Matrix4,
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
  METER_TO_LENGTH_UNIT,
  SCATTERING_TEXTURE_MU_S_SIZE,
  SCATTERING_TEXTURE_MU_SIZE,
  SCATTERING_TEXTURE_NU_SIZE,
  SCATTERING_TEXTURE_R_SIZE,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'
import { getAltitudeCorrectionOffset } from './getAltitudeCorrectionOffset'

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
  // Precomputed textures
  irradianceTexture?: DataTexture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: DataTexture | null
  useHalfFloat?: boolean

  // Atmosphere controls
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  photometric?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number

  // For internal use only
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

export interface AtmosphereMaterialBaseUniforms {
  cameraPosition: Uniform<Vector3>
  ellipsoidCenter: Uniform<Vector3>
  inverseEllipsoidMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>

  // Uniforms for atmosphere functions
  u_solar_irradiance: Uniform<Vector3>
  u_sun_angular_radius: Uniform<number>
  u_bottom_radius: Uniform<number>
  u_top_radius: Uniform<number>
  u_rayleigh_scattering: Uniform<Vector3>
  u_mie_scattering: Uniform<Vector3>
  u_mie_phase_function_g: Uniform<number>
  u_mu_s_min: Uniform<number>
  u_irradiance_texture: Uniform<DataTexture | null>
  u_scattering_texture: Uniform<Data3DTexture | null>
  u_single_mie_scattering_texture: Uniform<Data3DTexture | null>
  u_transmittance_texture: Uniform<DataTexture | null>
}

export abstract class AtmosphereMaterialBase extends RawShaderMaterial {
  // @ts-expect-error Intentionally omit index signature
  declare uniforms: AtmosphereMaterialBaseUniforms

  ellipsoid: Ellipsoid
  readonly ellipsoidMatrix = new Matrix4()
  correctAltitude: boolean
  private _renderTargetCount!: number

  constructor(
    params?: AtmosphereMaterialBaseParameters,
    protected readonly atmosphere = AtmosphereParameters.DEFAULT
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
        cameraPosition: new Uniform(new Vector3()),
        ellipsoidCenter: new Uniform(new Vector3()),
        inverseEllipsoidMatrix: new Uniform(new Matrix4()),
        altitudeCorrection: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),

        // Uniforms for atmosphere functions
        u_solar_irradiance: new Uniform(atmosphere.solarIrradiance),
        u_sun_angular_radius: new Uniform(sunAngularRadius ?? atmosphere.sunAngularRadius),
        u_bottom_radius: new Uniform(atmosphere.bottomRadius * METER_TO_LENGTH_UNIT),
        u_top_radius: new Uniform(atmosphere.topRadius * METER_TO_LENGTH_UNIT),
        u_rayleigh_scattering: new Uniform(atmosphere.rayleighScattering),
        u_mie_scattering: new Uniform(atmosphere.mieScattering),
        u_mie_phase_function_g: new Uniform(atmosphere.miePhaseFunctionG),
        u_mu_s_min: new Uniform(0),
        u_irradiance_texture: new Uniform(irradianceTexture),
        u_scattering_texture: new Uniform(scatteringTexture),
        u_single_mie_scattering_texture: new Uniform(scatteringTexture),
        u_transmittance_texture: new Uniform(transmittanceTexture),
        ...others.uniforms,
      } satisfies AtmosphereMaterialBaseUniforms,
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
        METER_TO_LENGTH_UNIT: `float(${METER_TO_LENGTH_UNIT})`,
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

  copyCameraSettings(camera: Camera): void {
    const uniforms = this.uniforms
    const cameraPosition = camera.getWorldPosition(
      uniforms.cameraPosition.value
    )
    const inverseEllipsoidMatrix = uniforms.inverseEllipsoidMatrix.value
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = vectorScratch
      .copy(cameraPosition)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(uniforms.ellipsoidCenter.value)

    const altitudeCorrection = uniforms.altitudeCorrection.value
    if (this.correctAltitude) {
      getAltitudeCorrectionOffset(
        cameraPositionECEF,
        this.atmosphere.bottomRadius,
        this.ellipsoid,
        altitudeCorrection
      )
    } else {
      altitudeCorrection.setScalar(0)
    }
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
    this.copyCameraSettings(camera)
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

  get ellipsoidCenter(): Vector3 {
    return this.uniforms.ellipsoidCenter.value
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

  /** @package */
  get renderTargetCount(): number {
    return this._renderTargetCount
  }

  /** @package */
  set renderTargetCount(value: number) {
    if (value !== this.renderTargetCount) {
      this._renderTargetCount = value
      this.needsUpdate = true
    }
  }
}
