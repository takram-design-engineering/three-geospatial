import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Camera,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
  type Data3DTexture,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget
} from 'three'

import {
  define,
  defineInt,
  Ellipsoid,
  Geodetic,
  remap,
  resolveIncludes,
  saturate,
  unrollLoops,
  type UniformMap
} from '@takram/three-geospatial'
import {
  cascadedShadowMaps,
  depth,
  interleavedGradientNoise,
  math,
  packing,
  raySphereIntersection,
  transform,
  vogelDisk
} from '@takram/three-geospatial/shaders'

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
import {
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from './types'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag?raw'
import vertexShader from './shaders/aerialPerspectiveEffect.vert?raw'
import functions from './shaders/functions.glsl?raw'
import parameters from './shaders/parameters.glsl?raw'
import skyShader from './shaders/sky.glsl?raw'

const vectorScratch1 = /*#__PURE__*/ new Vector3()
const vectorScratch2 = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface AerialPerspectiveEffectOptions {
  blendFunction?: BlendFunction
  normalBuffer?: Texture | null
  octEncodedNormal?: boolean
  reconstructNormal?: boolean

  // Precomputed textures
  irradianceTexture?: DataTexture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: DataTexture | null

  // Atmosphere controls
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  correctGeometricError?: boolean
  photometric?: boolean
  sunDirection?: Vector3

  // Rendering options
  sunIrradiance?: boolean
  skyIrradiance?: boolean
  transmittance?: boolean
  inscatter?: boolean
  irradianceScale?: number
  sky?: boolean
  sun?: boolean

  // Moon
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
}

export interface AerialPerspectiveEffectUniforms {
  normalBuffer: Uniform<Texture | null>
  projectionMatrix: Uniform<Matrix4>
  viewMatrix: Uniform<Matrix4>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  cameraPosition: Uniform<Vector3>
  bottomRadius: Uniform<number>
  ellipsoidRadii: Uniform<Vector3>
  ellipsoidCenter: Uniform<Vector3>
  inverseEllipsoidMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>
  irradianceScale: Uniform<number>
  irradianceMaskBuffer: Uniform<Texture | null>
  idealSphereAlpha: Uniform<number>
  moonDirection: Uniform<Vector3>
  moonAngularRadius: Uniform<number>
  lunarRadianceScale: Uniform<number>

  // Composition and shadow
  overlayBuffer: Uniform<Texture | null>
  shadowBuffer: Uniform<Texture | null>
  shadowMapSize: Uniform<Vector2>
  shadowIntervals: Uniform<Vector2[]>
  shadowMatrices: Uniform<Matrix4[]>
  inverseShadowMatrices: Uniform<Matrix4[]>
  shadowFar: Uniform<number>
  shadowTopHeight: Uniform<number>
  shadowRadius: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>
  frame: Uniform<number>
  shadowLengthBuffer: Uniform<Texture | null>

  // Uniforms for atmosphere functions
  u_solar_irradiance: Uniform<Vector3>
  u_sun_angular_radius: Uniform<number>
  u_bottom_radius: Uniform<number>
  u_top_radius: Uniform<number>
  u_rayleigh_scattering: Uniform<Vector3>
  u_mie_scattering: Uniform<Vector3>
  u_mie_phase_function_g: Uniform<number>
  u_mu_s_min: Uniform<number>
  u_max_rayleigh_shadow_length: Uniform<number>
  u_irradiance_texture: Uniform<DataTexture | null>
  u_scattering_texture: Uniform<Data3DTexture | null>
  u_single_mie_scattering_texture: Uniform<Data3DTexture | null>
  u_transmittance_texture: Uniform<DataTexture | null>
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
  declare uniforms: UniformMap<AerialPerspectiveEffectUniforms>

  private _ellipsoid!: Ellipsoid
  readonly ellipsoidMatrix = new Matrix4()
  correctAltitude: boolean

  overlay: AtmosphereOverlay | null = null
  shadow: AtmosphereShadow | null = null
  shadowLength: AtmosphereShadowLength | null = null

  constructor(
    private camera = new Camera(),
    options?: AerialPerspectiveEffectOptions,
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const {
      blendFunction,
      normalBuffer = null,
      octEncodedNormal,
      reconstructNormal,
      irradianceTexture = null,
      scatteringTexture = null,
      transmittanceTexture = null,
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
      unrollLoops(
        resolveIncludes(fragmentShader, {
          core: {
            depth,
            packing,
            math,
            transform,
            raySphereIntersection,
            cascadedShadowMaps,
            interleavedGradientNoise,
            vogelDisk
          },
          parameters,
          functions,
          sky: skyShader
        })
      ),
      {
        blendFunction,
        vertexShader: resolveIncludes(vertexShader, {
          parameters
        }),
        attributes: EffectAttribute.DEPTH,
        // prettier-ignore
        uniforms: new Map<string, Uniform>(
          Object.entries({
            normalBuffer: new Uniform(normalBuffer),
            projectionMatrix: new Uniform(new Matrix4()),
            viewMatrix: new Uniform(new Matrix4()),
            inverseProjectionMatrix: new Uniform(new Matrix4()),
            inverseViewMatrix: new Uniform(new Matrix4()),
            cameraPosition: new Uniform(new Vector3()),
            bottomRadius: new Uniform(atmosphere.bottomRadius),
            ellipsoidRadii: new Uniform(new Vector3()),
            ellipsoidCenter: new Uniform(new Vector3()),
            inverseEllipsoidMatrix: new Uniform(new Matrix4()),
            altitudeCorrection: new Uniform(new Vector3()),
            sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
            irradianceScale: new Uniform(irradianceScale),
            irradianceMaskBuffer: new Uniform(null),
            idealSphereAlpha: new Uniform(0),
            moonDirection: new Uniform(moonDirection?.clone() ?? new Vector3()),
            moonAngularRadius: new Uniform(moonAngularRadius),
            lunarRadianceScale: new Uniform(lunarRadianceScale),

            // Composition and shadow
            overlayBuffer: new Uniform(null),
            shadowBuffer: new Uniform(null),
            shadowMapSize: new Uniform(new Vector2()),
            shadowIntervals: new Uniform([]),
            shadowMatrices: new Uniform([]),
            inverseShadowMatrices: new Uniform([]),
            shadowFar: new Uniform(0),
            shadowTopHeight: new Uniform(0),
            shadowRadius: new Uniform(3),
            stbnTexture: new Uniform(null),
            frame: new Uniform(0),
            shadowLengthBuffer: new Uniform(null),

            // Uniforms for atmosphere functions
            u_solar_irradiance: new Uniform(atmosphere.solarIrradiance),
            u_sun_angular_radius: new Uniform(atmosphere.sunAngularRadius),
            u_bottom_radius: new Uniform(atmosphere.bottomRadius * METER_TO_LENGTH_UNIT),
            u_top_radius: new Uniform(atmosphere.topRadius * METER_TO_LENGTH_UNIT),
            u_rayleigh_scattering: new Uniform(atmosphere.rayleighScattering),
            u_mie_scattering: new Uniform(atmosphere.mieScattering),
            u_mie_phase_function_g: new Uniform(atmosphere.miePhaseFunctionG),
            u_mu_s_min: new Uniform(atmosphere.muSMin),
            u_max_rayleigh_shadow_length: new Uniform(10000 * METER_TO_LENGTH_UNIT),
            u_irradiance_texture: new Uniform(irradianceTexture),
            u_scattering_texture: new Uniform(scatteringTexture),
            u_single_mie_scattering_texture: new Uniform(scatteringTexture),
            u_transmittance_texture: new Uniform(transmittanceTexture)
          } satisfies AerialPerspectiveEffectUniforms)
        ),
        // prettier-ignore
        defines: new Map<string, string>([
          ['TRANSMITTANCE_TEXTURE_WIDTH', TRANSMITTANCE_TEXTURE_WIDTH.toFixed(0)],
          ['TRANSMITTANCE_TEXTURE_HEIGHT', TRANSMITTANCE_TEXTURE_HEIGHT.toFixed(0)],
          ['SCATTERING_TEXTURE_R_SIZE', SCATTERING_TEXTURE_R_SIZE.toFixed(0)],
          ['SCATTERING_TEXTURE_MU_SIZE', SCATTERING_TEXTURE_MU_SIZE.toFixed(0)],
          ['SCATTERING_TEXTURE_MU_S_SIZE', SCATTERING_TEXTURE_MU_S_SIZE.toFixed(0)],
          ['SCATTERING_TEXTURE_NU_SIZE', SCATTERING_TEXTURE_NU_SIZE.toFixed(0)],
          ['IRRADIANCE_TEXTURE_WIDTH', IRRADIANCE_TEXTURE_WIDTH.toFixed(0)],
          ['IRRADIANCE_TEXTURE_HEIGHT', IRRADIANCE_TEXTURE_HEIGHT.toFixed(0)],
          ['METER_TO_LENGTH_UNIT', METER_TO_LENGTH_UNIT.toFixed(7)],
          ['SUN_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${atmosphere.sunRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})`],
          ['SKY_SPECTRAL_RADIANCE_TO_LUMINANCE', `vec3(${atmosphere.skyRadianceToRelativeLuminance.toArray().map(v => v.toFixed(12)).join(',')})`]
        ])
      }
    )

    this.octEncodedNormal = octEncodedNormal
    this.reconstructNormal = reconstructNormal
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

  private copyCameraSettings(camera: Camera): void {
    const {
      projectionMatrix,
      matrixWorldInverse,
      projectionMatrixInverse,
      matrixWorld
    } = camera
    const uniforms = this.uniforms
    uniforms.get('projectionMatrix').value.copy(projectionMatrix)
    uniforms.get('viewMatrix').value.copy(matrixWorldInverse)
    uniforms.get('inverseProjectionMatrix').value.copy(projectionMatrixInverse)
    uniforms.get('inverseViewMatrix').value.copy(matrixWorld)

    const cameraPosition = camera.getWorldPosition(
      uniforms.get('cameraPosition').value
    )
    const inverseEllipsoidMatrix = uniforms
      .get('inverseEllipsoidMatrix')
      .value.copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = vectorScratch1
      .copy(cameraPosition)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(uniforms.get('ellipsoidCenter').value)

    try {
      // Calculate the projected scale of the globe in clip space used to
      // interpolate between the globe true normals and idealized normals to avoid
      // lighting artifacts.
      const cameraHeight =
        geodeticScratch.setFromECEF(cameraPositionECEF).height
      const projectedScale = vectorScratch2
        .set(0, this.ellipsoid.maximumRadius, -cameraHeight)
        .applyMatrix4(projectionMatrix)

      // Calculate interpolation alpha
      // Interpolation values are picked to match previous rough globe scales to
      // match the previous "camera height" approach for interpolation.
      // See: https://github.com/takram-design-engineering/three-geospatial/pull/23
      uniforms.get('idealSphereAlpha').value = saturate(
        remap(projectedScale.y, 41.5, 13.8, 0, 1)
      )
    } catch (error) {
      return // Abort when unable to project position to the ellipsoid surface.
    }

    const altitudeCorrection = uniforms.get('altitudeCorrection')
    if (this.correctAltitude) {
      getAltitudeCorrectionOffset(
        cameraPositionECEF,
        this.atmosphere.bottomRadius,
        this.ellipsoid,
        altitudeCorrection.value
      )
    } else {
      altitudeCorrection.value.setScalar(0)
    }
  }

  private updateComposition(): void {
    const { uniforms, defines, overlay, shadow, shadowLength } = this

    const prevOverlay = defines.has('HAS_OVERLAY')
    const nextOverlay = overlay != null
    if (nextOverlay !== prevOverlay) {
      if (nextOverlay) {
        defines.set('HAS_OVERLAY', '1')
      } else {
        defines.delete('HAS_OVERLAY')
        uniforms.get('overlayBuffer').value = null
      }
      this.setChanged()
    }
    if (nextOverlay) {
      uniforms.get('overlayBuffer').value = overlay.map
    }

    const prevShadow = defines.has('HAS_SHADOW')
    const nextShadow = shadow != null
    if (nextShadow !== prevShadow) {
      if (nextShadow) {
        defines.set('HAS_SHADOW', '1')
      } else {
        defines.delete('HAS_SHADOW')
        uniforms.get('shadowBuffer').value = null
      }
      this.setChanged()
    }
    if (nextShadow) {
      const prevCascadeCount = defines.get('SHADOW_CASCADE_COUNT')
      const nextCascadeCount = `${shadow.cascadeCount}`
      if (prevCascadeCount !== nextCascadeCount) {
        defines.set('SHADOW_CASCADE_COUNT', shadow.cascadeCount.toFixed(0))
        this.setChanged()
      }
      uniforms.get('shadowBuffer').value = shadow.map
      uniforms.get('shadowMapSize').value = shadow.mapSize
      uniforms.get('shadowIntervals').value = shadow.intervals
      uniforms.get('shadowMatrices').value = shadow.matrices
      uniforms.get('inverseShadowMatrices').value = shadow.inverseMatrices
      uniforms.get('shadowFar').value = shadow.far
      uniforms.get('shadowTopHeight').value = shadow.topHeight
    }

    const prevShadowLength = defines.has('HAS_SHADOW_LENGTH')
    const nextShadowLength = shadowLength != null
    if (nextShadowLength !== prevShadowLength) {
      if (nextShadowLength) {
        defines.set('HAS_SHADOW_LENGTH', '1')
      } else {
        defines.delete('HAS_SHADOW_LENGTH')
        uniforms.get('shadowLengthBuffer').value = null
      }
      this.setChanged()
    }
    if (nextShadowLength) {
      uniforms.get('shadowLengthBuffer').value = shadowLength.map
    }
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.copyCameraSettings(this.camera)
    this.updateComposition()
    ++this.uniforms.get('frame').value
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer').value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer').value = value
  }

  @define('OCT_ENCODED_NORMAL')
  octEncodedNormal: boolean

  @define('RECONSTRUCT_NORMAL')
  reconstructNormal: boolean

  get irradianceTexture(): DataTexture | null {
    return this.uniforms.get('u_irradiance_texture').value
  }

  set irradianceTexture(value: DataTexture | null) {
    this.uniforms.get('u_irradiance_texture').value = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('u_scattering_texture').value
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('u_scattering_texture').value = value
    this.uniforms.get('u_single_mie_scattering_texture').value = value
  }

  get transmittanceTexture(): DataTexture | null {
    return this.uniforms.get('u_transmittance_texture').value
  }

  set transmittanceTexture(value: DataTexture | null) {
    this.uniforms.get('u_transmittance_texture').value = value
  }

  get ellipsoid(): Ellipsoid {
    return this._ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this._ellipsoid = value
    this.uniforms.get('ellipsoidRadii').value.copy(value.radii)
  }

  get ellipsoidCenter(): Vector3 {
    return this.uniforms.get('ellipsoidCenter').value
  }

  @define('CORRECT_GEOMETRIC_ERROR')
  correctGeometricError: boolean

  @define('PHOTOMETRIC')
  photometric: boolean

  get sunDirection(): Vector3 {
    return this.uniforms.get('sunDirection').value
  }

  @define('SUN_IRRADIANCE')
  sunIrradiance: boolean

  @define('SKY_IRRADIANCE')
  skyIrradiance: boolean

  @define('TRANSMITTANCE')
  transmittance: boolean

  @define('INSCATTER')
  inscatter: boolean

  get irradianceScale(): number {
    return this.uniforms.get('irradianceScale').value
  }

  set irradianceScale(value: number) {
    this.uniforms.get('irradianceScale').value = value
  }

  get irradianceMaskBuffer(): Texture | null {
    return this.uniforms.get('irradianceMaskBuffer').value
  }

  set irradianceMaskBuffer(value: Texture | null) {
    this.uniforms.get('irradianceMaskBuffer').value = value
    const defines = this.defines
    const prevValue = defines.has('HAS_IRRADIANCE_MASK')
    const nextValue = value != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_IRRADIANCE_MASK', '1')
      } else {
        defines.delete('HAS_IRRADIANCE_MASK')
      }
      this.setChanged()
    }
  }

  @define('SKY')
  sky: boolean

  @define('SUN')
  sun: boolean

  @define('MOON')
  moon: boolean

  get moonDirection(): Vector3 {
    return this.uniforms.get('moonDirection').value
  }

  get moonAngularRadius(): number {
    return this.uniforms.get('moonAngularRadius').value
  }

  set moonAngularRadius(value: number) {
    this.uniforms.get('moonAngularRadius').value = value
  }

  get lunarRadianceScale(): number {
    return this.uniforms.get('lunarRadianceScale').value
  }

  set lunarRadianceScale(value: number) {
    this.uniforms.get('lunarRadianceScale').value = value
  }

  get stbnTexture(): Data3DTexture | null {
    return this.uniforms.get('stbnTexture').value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.uniforms.get('stbnTexture').value = value
  }

  get shadowRadius(): number {
    return this.uniforms.get('shadowRadius').value
  }

  set shadowRadius(value: number) {
    this.uniforms.get('shadowRadius').value = value
  }

  @defineInt('SHADOW_SAMPLE_COUNT', { min: 1, max: 16 })
  shadowSampleCount = 8
}
