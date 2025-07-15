import {
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector3,
  type BufferGeometry,
  type Camera,
  type Data3DTexture,
  type Group,
  type Object3D,
  type Scene,
  type ShaderMaterialParameters,
  type Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer
} from 'three'

import { define, Ellipsoid } from '@takram/three-geospatial'

import {
  AtmosphereParameters,
  type AtmosphereParametersUniform
} from './AtmosphereParameters'
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
  irradianceTexture?: Texture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: Texture | null
  singleMieScatteringTexture?: Data3DTexture | null
  higherOrderScatteringTexture?: Data3DTexture | null

  // Atmosphere controls
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  sunDirection?: Vector3
  sunAngularRadius?: number
  ground?: boolean

  // For internal use only
  renderTargetCount?: number
}

export interface AtmosphereMaterialBaseParameters
  extends Partial<ShaderMaterialParameters>,
    AtmosphereMaterialProps {}

export const atmosphereMaterialParametersBaseDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  renderTargetCount: 1
} satisfies AtmosphereMaterialBaseParameters

export interface AtmosphereMaterialBaseUniforms {
  [key: string]: Uniform<unknown>
  cameraPosition: Uniform<Vector3>
  worldToECEFMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>

  // Uniforms for atmosphere functions
  ATMOSPHERE: AtmosphereParametersUniform
  SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: Uniform<Vector3>
  SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: Uniform<Vector3>
  irradiance_texture: Uniform<Texture | null>
  scattering_texture: Uniform<Data3DTexture | null>
  transmittance_texture: Uniform<Texture | null>
  single_mie_scattering_texture: Uniform<Data3DTexture | null>
  higher_order_scattering_texture: Uniform<Data3DTexture | null>
}

export abstract class AtmosphereMaterialBase extends RawShaderMaterial {
  declare uniforms: AtmosphereMaterialBaseUniforms

  ellipsoid: Ellipsoid
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
      singleMieScatteringTexture = null,
      higherOrderScatteringTexture = null,
      ellipsoid,
      correctAltitude,
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
        worldToECEFMatrix: new Uniform(new Matrix4()),
        altitudeCorrection: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),

        // Uniforms for atmosphere functions
        ATMOSPHERE: atmosphere.toUniform(),
        SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: new Uniform(atmosphere.sunRadianceToRelativeLuminance),
        SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: new Uniform(atmosphere.skyRadianceToRelativeLuminance),
        irradiance_texture: new Uniform(irradianceTexture),
        scattering_texture: new Uniform(scatteringTexture),
        transmittance_texture: new Uniform(transmittanceTexture),
        single_mie_scattering_texture: new Uniform(null),
        higher_order_scattering_texture: new Uniform(null),
        ...others.uniforms
      } satisfies AtmosphereMaterialBaseUniforms,
      defines: {
        PI: `${Math.PI}`,
        TRANSMITTANCE_TEXTURE_WIDTH: TRANSMITTANCE_TEXTURE_WIDTH.toFixed(0),
        TRANSMITTANCE_TEXTURE_HEIGHT: TRANSMITTANCE_TEXTURE_HEIGHT.toFixed(0),
        SCATTERING_TEXTURE_R_SIZE: SCATTERING_TEXTURE_R_SIZE.toFixed(0),
        SCATTERING_TEXTURE_MU_SIZE: SCATTERING_TEXTURE_MU_SIZE.toFixed(0),
        SCATTERING_TEXTURE_MU_S_SIZE: SCATTERING_TEXTURE_MU_S_SIZE.toFixed(0),
        SCATTERING_TEXTURE_NU_SIZE: SCATTERING_TEXTURE_NU_SIZE.toFixed(0),
        IRRADIANCE_TEXTURE_WIDTH: IRRADIANCE_TEXTURE_WIDTH.toFixed(0),
        IRRADIANCE_TEXTURE_HEIGHT: IRRADIANCE_TEXTURE_HEIGHT.toFixed(0),
        METER_TO_LENGTH_UNIT: METER_TO_LENGTH_UNIT.toFixed(7),
        ...others.defines
      }
    })

    this.singleMieScatteringTexture = singleMieScatteringTexture
    this.higherOrderScatteringTexture = higherOrderScatteringTexture
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    if (sunAngularRadius != null) {
      this.sunAngularRadius = sunAngularRadius
    }
    this.renderTargetCount = renderTargetCount
  }

  copyCameraSettings(camera: Camera): void {
    const uniforms = this.uniforms
    const cameraPosition = camera.getWorldPosition(
      uniforms.cameraPosition.value
    )
    const cameraPositionECEF = vectorScratch
      .copy(cameraPosition)
      .applyMatrix4(uniforms.worldToECEFMatrix.value)

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

  get irradianceTexture(): Texture | null {
    return this.uniforms.irradiance_texture.value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.irradiance_texture.value = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.uniforms.scattering_texture.value
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.uniforms.scattering_texture.value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.transmittance_texture.value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.transmittance_texture.value = value
  }

  /** @private */
  @define('COMBINED_SCATTERING_TEXTURES')
  combinedScatteringTextures = false

  get singleMieScatteringTexture(): Data3DTexture | null {
    return this.uniforms.single_mie_scattering_texture.value
  }

  set singleMieScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.single_mie_scattering_texture.value = value
    this.combinedScatteringTextures = value == null
  }

  /** @private */
  @define('HAS_HIGHER_ORDER_SCATTERING_TEXTURE')
  hasHigherOrderScatteringTexture = false

  get higherOrderScatteringTexture(): Data3DTexture | null {
    return this.uniforms.higher_order_scattering_texture.value
  }

  set higherOrderScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.higher_order_scattering_texture.value = value
    this.hasHigherOrderScatteringTexture = value != null
  }

  get worldToECEFMatrix(): Matrix4 {
    return this.uniforms.worldToECEFMatrix.value
  }

  get sunDirection(): Vector3 {
    return this.uniforms.sunDirection.value
  }

  get sunAngularRadius(): number {
    return this.uniforms.ATMOSPHERE.value.sun_angular_radius
  }

  set sunAngularRadius(value: number) {
    this.uniforms.ATMOSPHERE.value.sun_angular_radius = value
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
