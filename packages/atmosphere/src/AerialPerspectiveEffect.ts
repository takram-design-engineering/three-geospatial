import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Camera,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
  type Data3DTexture,
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
import {
  AtmosphereLightingMask,
  type AtmosphereOverlay,
  type AtmosphereShadow,
  type AtmosphereShadowLength
} from './types'

import fragmentShader from './shaders/aerialPerspectiveEffect.frag?raw'
import vertexShader from './shaders/aerialPerspectiveEffect.vert?raw'
import common from './shaders/bruneton/common.glsl?raw'
import definitions from './shaders/bruneton/definitions.glsl?raw'
import runtime from './shaders/bruneton/runtime.glsl?raw'
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
  irradianceTexture?: Texture | null
  scatteringTexture?: Data3DTexture | null
  transmittanceTexture?: Texture | null
  singleMieScatteringTexture?: Data3DTexture | null
  higherOrderScatteringTexture?: Data3DTexture | null

  // Atmosphere controls
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
  correctGeometricError?: boolean
  sunDirection?: Vector3

  // Rendering options
  /** @deprecated Use sunLight instead. */
  sunIrradiance?: boolean
  sunLight?: boolean
  /** @deprecated Use skyLight instead. */
  skyIrradiance?: boolean
  skyLight?: boolean
  transmittance?: boolean
  inscatter?: boolean
  /** @deprecated Use albedoScale instead. */
  irradianceScale?: number
  albedoScale?: number
  sky?: boolean
  sun?: boolean
  moon?: boolean
  moonDirection?: Vector3
  moonAngularRadius?: number
  lunarRadianceScale?: number
  ground?: boolean
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
  worldToECEFMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  geometricErrorCorrectionAmount: Uniform<number>
  sunDirection: Uniform<Vector3>
  albedoScale: Uniform<number>
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

  // Lighting mask
  lightingMaskBuffer: Uniform<Texture | null>

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

export const aerialPerspectiveEffectOptionsDefaults = {
  blendFunction: BlendFunction.NORMAL,
  octEncodedNormal: false,
  reconstructNormal: false,
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true,
  correctGeometricError: true,
  sunLight: false,
  skyLight: false,
  transmittance: true,
  inscatter: true,
  albedoScale: 1,
  sky: false,
  sun: true,
  moon: true,
  moonAngularRadius: 0.0045, // ≈ 15.5 arcminutes
  lunarRadianceScale: 1,
  ground: true
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends Effect {
  declare uniforms: UniformMap<AerialPerspectiveEffectUniforms>

  private _ellipsoid!: Ellipsoid
  correctAltitude: boolean

  overlay: AtmosphereOverlay | null = null
  shadow: AtmosphereShadow | null = null
  shadowLength: AtmosphereShadowLength | null = null
  lightingMask: AtmosphereLightingMask | null = null

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
      singleMieScatteringTexture = null,
      higherOrderScatteringTexture = null,
      ellipsoid,
      correctAltitude,
      correctGeometricError,
      sunDirection,
      sunIrradiance,
      sunLight,
      skyIrradiance,
      skyLight,
      transmittance,
      inscatter,
      irradianceScale,
      albedoScale,
      sky,
      sun,
      moon,
      moonDirection,
      moonAngularRadius,
      lunarRadianceScale,
      ground
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
          bruneton: {
            common,
            definitions,
            runtime
          },
          sky: skyShader
        })
      ),
      {
        blendFunction,
        vertexShader,
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
            worldToECEFMatrix: new Uniform(new Matrix4()),
            altitudeCorrection: new Uniform(new Vector3()),
            geometricErrorCorrectionAmount: new Uniform(0),
            sunDirection: new Uniform(sunDirection?.clone() ?? new Vector3()),
            albedoScale: new Uniform(irradianceScale ?? albedoScale),
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

            // Lighting mask
            lightingMaskBuffer: new Uniform(null),

            // Uniforms for atmosphere functions
            ATMOSPHERE: atmosphere.toUniform(),
            SUN_SPECTRAL_RADIANCE_TO_LUMINANCE: new Uniform(atmosphere.sunRadianceToRelativeLuminance),
            SKY_SPECTRAL_RADIANCE_TO_LUMINANCE: new Uniform(atmosphere.skyRadianceToRelativeLuminance),
            irradiance_texture: new Uniform(irradianceTexture),
            scattering_texture: new Uniform(scatteringTexture),
            transmittance_texture: new Uniform(transmittanceTexture),
            single_mie_scattering_texture: new Uniform(null),
            higher_order_scattering_texture: new Uniform(null),
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
          ['METER_TO_LENGTH_UNIT', METER_TO_LENGTH_UNIT.toFixed(7)]
        ])
      }
    )

    this.octEncodedNormal = octEncodedNormal
    this.reconstructNormal = reconstructNormal
    this.singleMieScatteringTexture = singleMieScatteringTexture
    this.higherOrderScatteringTexture = higherOrderScatteringTexture
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
    this.correctGeometricError = correctGeometricError
    this.sunLight = sunIrradiance ?? sunLight
    this.skyLight = skyIrradiance ?? skyLight
    this.transmittance = transmittance
    this.inscatter = inscatter
    this.sky = sky
    this.sun = sun
    this.moon = moon
    this.ground = ground
  }

  override get mainCamera(): Camera {
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
    const worldToECEFMatrix = uniforms.get('worldToECEFMatrix').value
    const cameraPositionECEF = vectorScratch1
      .copy(cameraPosition)
      .applyMatrix4(worldToECEFMatrix)

    try {
      // Calculate the projected scale of the globe in clip space used to
      // interpolate between the globe true normals and idealized normals to
      // avoid lighting artifacts.
      const cameraHeight =
        geodeticScratch.setFromECEF(cameraPositionECEF).height
      const projectedScale = vectorScratch2
        .set(0, this.ellipsoid.maximumRadius, -Math.max(0.0, cameraHeight))
        .applyMatrix4(projectionMatrix)

      // Interpolation values are picked to match previous rough globe scales to
      // match the previous "camera height" approach for interpolation.
      // See: https://github.com/takram-design-engineering/three-geospatial/pull/23
      uniforms.get('geometricErrorCorrectionAmount').value = saturate(
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

  private updateOverlay(): boolean {
    let needsUpdate = false
    const { uniforms, defines, overlay } = this
    const prevValue = defines.has('HAS_OVERLAY')
    const nextValue = overlay != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_OVERLAY', '1')
      } else {
        defines.delete('HAS_OVERLAY')
        uniforms.get('overlayBuffer').value = null
      }
      needsUpdate = true
    }
    if (nextValue) {
      uniforms.get('overlayBuffer').value = overlay.map
    }
    return needsUpdate
  }

  private updateShadow(): boolean {
    let needsUpdate = false
    const { uniforms, defines, shadow } = this
    const prevValue = defines.has('HAS_SHADOW')
    const nextValue = shadow != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_SHADOW', '1')
      } else {
        defines.delete('HAS_SHADOW')
        uniforms.get('shadowBuffer').value = null
      }
      needsUpdate = true
    }
    if (nextValue) {
      const prevCascadeCount = defines.get('SHADOW_CASCADE_COUNT')
      const nextCascadeCount = `${shadow.cascadeCount}`
      if (prevCascadeCount !== nextCascadeCount) {
        defines.set('SHADOW_CASCADE_COUNT', shadow.cascadeCount.toFixed(0))
        needsUpdate = true
      }
      uniforms.get('shadowBuffer').value = shadow.map
      uniforms.get('shadowMapSize').value = shadow.mapSize
      uniforms.get('shadowIntervals').value = shadow.intervals
      uniforms.get('shadowMatrices').value = shadow.matrices
      uniforms.get('inverseShadowMatrices').value = shadow.inverseMatrices
      uniforms.get('shadowFar').value = shadow.far
      uniforms.get('shadowTopHeight').value = shadow.topHeight
    }
    return needsUpdate
  }

  private updateShadowLength(): boolean {
    let needsUpdate = false
    const { uniforms, defines, shadowLength } = this
    const prevValue = defines.has('HAS_SHADOW_LENGTH')
    const nextValue = shadowLength != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_SHADOW_LENGTH', '1')
      } else {
        defines.delete('HAS_SHADOW_LENGTH')
        uniforms.get('shadowLengthBuffer').value = null
      }
      needsUpdate = true
    }
    if (nextValue) {
      uniforms.get('shadowLengthBuffer').value = shadowLength.map
    }
    return needsUpdate
  }

  private updateLightingMask(): boolean {
    let needsUpdate = false
    const { uniforms, defines, lightingMask } = this
    const prevValue = defines.has('HAS_LIGHTING_MASK')
    const nextValue = lightingMask != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_LIGHTING_MASK', '1')
      } else {
        defines.delete('HAS_LIGHTING_MASK')
        uniforms.get('lightingMaskBuffer').value = null
      }
      needsUpdate = true
    }
    if (nextValue) {
      uniforms.get('lightingMaskBuffer').value = lightingMask.map

      const prevChannel = defines.get('LIGHTING_MASK_CHANNEL')
      const nextChannel = lightingMask.channel
      if (nextChannel !== prevChannel) {
        if (!/^[rgba]$/.test(nextChannel)) {
          console.error(`Expression validation failed: ${nextChannel}`)
        } else {
          defines.set('LIGHTING_MASK_CHANNEL', nextChannel)
          needsUpdate = true
        }
      }
    }
    return needsUpdate
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.copyCameraSettings(this.camera)

    let needsUpdate = false
    needsUpdate ||= this.updateOverlay()
    needsUpdate ||= this.updateShadow()
    needsUpdate ||= this.updateShadowLength()
    needsUpdate ||= this.updateLightingMask()
    if (needsUpdate) {
      this.setChanged()
    }

    ++this.uniforms.get('frame').value
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer').value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer').value = value
    this.hasNormals = value != null
  }

  @define('OCT_ENCODED_NORMAL')
  octEncodedNormal: boolean

  @define('RECONSTRUCT_NORMAL')
  reconstructNormal: boolean

  @define('HAS_NORMALS')
  hasNormals = false

  get irradianceTexture(): Texture | null {
    return this.uniforms.get('irradiance_texture').value
  }

  set irradianceTexture(value: Texture | null) {
    this.uniforms.get('irradiance_texture').value = value
  }

  get scatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('scattering_texture').value
  }

  set scatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('scattering_texture').value = value
  }

  get transmittanceTexture(): Texture | null {
    return this.uniforms.get('transmittance_texture').value
  }

  set transmittanceTexture(value: Texture | null) {
    this.uniforms.get('transmittance_texture').value = value
  }

  /** @private */
  @define('COMBINED_SCATTERING_TEXTURES')
  combinedScatteringTextures = false

  get singleMieScatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('single_mie_scattering_texture').value
  }

  set singleMieScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('single_mie_scattering_texture').value = value
    this.combinedScatteringTextures = value == null
  }

  /** @private */
  @define('HAS_HIGHER_ORDER_SCATTERING_TEXTURE')
  hasHigherOrderScatteringTexture = false

  get higherOrderScatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('higher_order_scattering_texture').value
  }

  set higherOrderScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('higher_order_scattering_texture').value = value
    this.hasHigherOrderScatteringTexture = value != null
  }

  get ellipsoid(): Ellipsoid {
    return this._ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    this._ellipsoid = value
    this.uniforms.get('ellipsoidRadii').value.copy(value.radii)
  }

  get worldToECEFMatrix(): Matrix4 {
    return this.uniforms.get('worldToECEFMatrix').value
  }

  @define('CORRECT_GEOMETRIC_ERROR')
  correctGeometricError: boolean

  get sunDirection(): Vector3 {
    return this.uniforms.get('sunDirection').value
  }

  /** @deprecated Use sunLight instead. */
  get sunIrradiance(): boolean {
    return this.sunLight
  }

  /** @deprecated Use sunLight instead. */
  set sunIrradiance(value: boolean) {
    this.sunLight = value
  }

  @define('SUN_LIGHT')
  sunLight: boolean

  /** @deprecated Use skyLight instead. */
  get skyIrradiance(): boolean {
    return this.skyLight
  }

  /** @deprecated Use skyLight instead. */
  set skyIrradiance(value: boolean) {
    this.skyLight = value
  }

  @define('SKY_LIGHT')
  skyLight: boolean

  @define('TRANSMITTANCE')
  transmittance: boolean

  @define('INSCATTER')
  inscatter: boolean

  /** @deprecated Use albedoScale instead. */
  get irradianceScale(): number {
    return this.albedoScale
  }

  /** @deprecated Use albedoScale instead. */
  set irradianceScale(value: number) {
    this.albedoScale = value
  }

  get albedoScale(): number {
    return this.uniforms.get('albedoScale').value
  }

  set albedoScale(value: number) {
    this.uniforms.get('albedoScale').value = value
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

  @define('GROUND')
  ground: boolean

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
