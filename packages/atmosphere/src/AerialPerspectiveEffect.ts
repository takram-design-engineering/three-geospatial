import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import {
  Camera,
  DepthPackingStrategies,
  Matrix4,
  TextureDataType,
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
  cascadedShadow,
  depth,
  interleavedGradientNoise,
  math,
  packing,
  raySphereIntersection,
  screenSpaceRaycast,
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
import { ScreenSpaceShadowPass } from './ScreenSpaceShadowPass'
import {
  AtmosphereLightingMask,
  AtmosphereSceneShadow,
  type AtmosphereOverlay,
  type AtmosphereOverlayShadow,
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
  worldToECEFMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  geometricErrorCorrectionAmount: Uniform<number>
  sunDirection: Uniform<Vector3>
  albedoScale: Uniform<number>
  moonDirection: Uniform<Vector3>
  moonAngularRadius: Uniform<number>
  lunarRadianceScale: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>
  frame: Uniform<number>

  // Compositions
  overlayBuffer: Uniform<Texture | null>
  overlayShadow: Uniform<{
    map: Texture | null
    cascadeCount: number
    intervals: Vector2[]
    matrices: Matrix4[]
    inverseMatrices: Matrix4[]
    far: number
    topHeight: number
  }>
  overlayShadowRadius: Uniform<number>
  shadowLengthBuffer: Uniform<Texture | null>
  lightingMaskBuffer: Uniform<Texture | null>
  sceneShadow: Uniform<{
    maps: Array<Texture | null>
    cascadeCount: number
    intervals: Vector2[]
    matrices: Matrix4[]
    inverseMatrices: Matrix4[]
    near: number
    far: number
  }>
  sceneShadowRadius: Uniform<number>
  screenSpaceShadowBuffer: Uniform<Texture | null>

  // Uniforms for atmosphere functions
  atmosphere: AtmosphereParametersUniform
  sunSpectralRadianceToLuminance: Uniform<Vector3>
  skySpectralRadianceToLuminance: Uniform<Vector3>
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
  lunarRadianceScale: 1
} satisfies AerialPerspectiveEffectOptions

export class AerialPerspectiveEffect extends Effect {
  declare uniforms: UniformMap<AerialPerspectiveEffectUniforms>

  private _ellipsoid!: Ellipsoid
  correctAltitude: boolean

  overlay: AtmosphereOverlay | null = null
  overlayShadow: AtmosphereOverlayShadow | null = null
  shadowLength: AtmosphereShadowLength | null = null
  lightingMask: AtmosphereLightingMask | null = null
  sceneShadow: AtmosphereSceneShadow | null = null

  private readonly screenSpaceShadowPass: ScreenSpaceShadowPass

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
      lunarRadianceScale
    } = { ...aerialPerspectiveEffectOptionsDefaults, ...options }

    // TODO: Create the resources (especially the GPU resources) for the
    // screen-space shadow only when they are needed.
    const screenSpaceShadowPass = new ScreenSpaceShadowPass()

    super(
      'AerialPerspectiveEffect',
      unrollLoops(
        resolveIncludes(fragmentShader, {
          core: {
            cascadedShadow,
            depth,
            interleavedGradientNoise,
            math,
            packing,
            raySphereIntersection,
            screenSpaceRaycast,
            transform,
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
            normalBuffer: new Uniform(null),
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
            stbnTexture: new Uniform(null),
            frame: new Uniform(0),

            // Compositions
            overlayBuffer: new Uniform(null),
            overlayShadow: new Uniform({
              map: null,
              cascadeCount: 0,
              intervals: [],
              matrices: [],
              inverseMatrices: [],
              far: 0,
              topHeight: 0
            }),
            overlayShadowRadius: new Uniform(3),
            shadowLengthBuffer: new Uniform(null),
            lightingMaskBuffer: new Uniform(null),
            sceneShadow: new Uniform({
              maps: [],
              cascadeCount: 0,
              intervals: [],
              matrices: [],
              inverseMatrices: [],
              near: 0,
              far: 0
            }),
            sceneShadowRadius: new Uniform(2),
            screenSpaceShadowBuffer: new Uniform(screenSpaceShadowPass.texture),

            // Uniforms for atmosphere functions
            atmosphere: atmosphere.toUniform(),
            sunSpectralRadianceToLuminance: new Uniform(atmosphere.sunRadianceToRelativeLuminance),
            skySpectralRadianceToLuminance: new Uniform(atmosphere.skyRadianceToRelativeLuminance),
            irradiance_texture: new Uniform(irradianceTexture),
            scattering_texture: new Uniform(scatteringTexture),
            transmittance_texture: new Uniform(transmittanceTexture),
            single_mie_scattering_texture: new Uniform(null),
            higher_order_scattering_texture: new Uniform(null)
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

    this.screenSpaceShadowPass = screenSpaceShadowPass
    this.normalBuffer = normalBuffer
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

    this.screenSpaceShadowPass.mainCamera = camera
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

  private updateOverlayShadow(): boolean {
    let needsUpdate = false
    const { uniforms, defines, overlayShadow } = this
    const prevValue = defines.has('HAS_OVERLAY_SHADOW')
    const nextValue = overlayShadow != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_OVERLAY_SHADOW', '1')
      } else {
        defines.delete('HAS_OVERLAY_SHADOW')
        uniforms.get('overlayShadow').value.map = null
      }
      needsUpdate = true
    }
    if (nextValue) {
      const uniform = uniforms.get('overlayShadow').value
      uniform.map = overlayShadow.map
      uniform.cascadeCount = overlayShadow.cascadeCount
      uniform.intervals = overlayShadow.intervals
      uniform.matrices = overlayShadow.matrices
      uniform.inverseMatrices = overlayShadow.inverseMatrices
      uniform.far = overlayShadow.far
      uniform.topHeight = overlayShadow.topHeight
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

  private updateSceneShadow(): boolean {
    let needsUpdate = false
    const { uniforms, defines, sceneShadow } = this
    const prevValue = defines.has('HAS_SCENE_SHADOW')
    const nextValue = sceneShadow != null
    if (nextValue !== prevValue) {
      if (nextValue) {
        defines.set('HAS_SCENE_SHADOW', '1')
      } else {
        defines.delete('HAS_SCENE_SHADOW')
        uniforms.get('sceneShadow').value.maps = []
      }
      needsUpdate = true
    }
    if (nextValue) {
      const uniform = uniforms.get('sceneShadow').value
      uniform.maps = sceneShadow.maps
      uniform.cascadeCount = sceneShadow.cascadeCount
      uniform.intervals = sceneShadow.intervals
      uniform.matrices = sceneShadow.matrices
      uniform.inverseMatrices = sceneShadow.inverseMatrices
      uniform.far = sceneShadow.far
    }
    return needsUpdate
  }

  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    this.copyCameraSettings(this.camera)

    const needsUpdate =
      this.updateOverlay() ||
      this.updateOverlayShadow() ||
      this.updateShadowLength() ||
      this.updateLightingMask() ||
      this.updateSceneShadow()
    if (needsUpdate) {
      this.setChanged()
    }

    const frame = this.uniforms.get('frame')
    ++frame.value

    if (this.screenSpaceShadow) {
      const { screenSpaceShadowPass } = this
      screenSpaceShadowPass.sceneShadow = this.sceneShadow
      screenSpaceShadowPass.sunDirection.copy(this.sunDirection)
      screenSpaceShadowPass.frame = frame.value
      screenSpaceShadowPass.render(renderer, null, null)
    }
  }

  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: TextureDataType
  ): void {
    this.screenSpaceShadowPass.initialize(renderer, alpha, frameBufferType)
  }

  override setDepthTexture(
    depthTexture: Texture,
    depthPacking?: DepthPackingStrategies
  ): void {
    this.screenSpaceShadowPass.setDepthTexture(depthTexture, depthPacking)
  }

  override setSize(width: number, height: number): void {
    this.screenSpaceShadowPass.setSize(width, height)
  }

  get normalBuffer(): Texture | null {
    return this.uniforms.get('normalBuffer').value
  }

  set normalBuffer(value: Texture | null) {
    this.uniforms.get('normalBuffer').value = value
    this.screenSpaceShadowPass.normalBuffer = value
  }

  @define('OCT_ENCODED_NORMAL')
  octEncodedNormal: boolean

  @define('RECONSTRUCT_NORMAL')
  reconstructNormal: boolean

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
  _combinedScatteringTextures = false

  get singleMieScatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('single_mie_scattering_texture').value
  }

  set singleMieScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('single_mie_scattering_texture').value = value
    this._combinedScatteringTextures = value == null
  }

  /** @private */
  @define('HAS_HIGHER_ORDER_SCATTERING_TEXTURE')
  _hasHigherOrderScatteringTexture = false

  get higherOrderScatteringTexture(): Data3DTexture | null {
    return this.uniforms.get('higher_order_scattering_texture').value
  }

  set higherOrderScatteringTexture(value: Data3DTexture | null) {
    this.uniforms.get('higher_order_scattering_texture').value = value
    this._hasHigherOrderScatteringTexture = value != null
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

  get stbnTexture(): Data3DTexture | null {
    return this.uniforms.get('stbnTexture').value
  }

  set stbnTexture(value: Data3DTexture | null) {
    this.uniforms.get('stbnTexture').value = value
    this.screenSpaceShadowPass.stbnTexture = value
  }

  get overlayShadowRadius(): number {
    return this.uniforms.get('overlayShadowRadius').value
  }

  set overlayShadowRadius(value: number) {
    this.uniforms.get('overlayShadowRadius').value = value
  }

  get sceneShadowRadius(): number {
    return this.uniforms.get('sceneShadowRadius').value
  }

  set sceneShadowRadius(value: number) {
    this.uniforms.get('sceneShadowRadius').value = value
  }

  @defineInt('SHADOW_SAMPLE_COUNT', { min: 1, max: 16 })
  shadowSampleCount = 8

  @define('SCREEN_SPACE_SHADOW')
  screenSpaceShadow = false
}
