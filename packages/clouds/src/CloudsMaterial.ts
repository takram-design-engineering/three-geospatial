import {
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
  Vector4,
  type BufferGeometry,
  type Camera,
  type Data3DTexture,
  type DataArrayTexture,
  type Group,
  type Object3D,
  type OrthographicCamera,
  type PerspectiveCamera,
  type Scene,
  type Texture,
  type WebGLRenderer
} from 'three'

import {
  AtmosphereMaterialBase,
  AtmosphereParameters,
  type AtmosphereMaterialBaseUniforms
} from '@takram/three-atmosphere'
import {
  common,
  definitions,
  runtime
} from '@takram/three-atmosphere/shaders/bruneton'
import {
  define,
  defineExpression,
  defineFloat,
  defineInt,
  Geodetic,
  reinterpretType,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import {
  cascadedShadowMaps,
  depth,
  generators,
  interleavedGradientNoise,
  math,
  raySphereIntersection,
  turbo,
  vogelDisk
} from '@takram/three-geospatial/shaders'

import { bayerOffsets } from './bayer'
import { defaults } from './qualityPresets'
import type {
  AtmosphereUniforms,
  CloudLayerUniforms,
  CloudParameterUniforms
} from './uniforms'

import fragmentShader from './shaders/clouds.frag?raw'
import clouds from './shaders/clouds.glsl?raw'
import vertexShader from './shaders/clouds.vert?raw'
import parameters from './shaders/parameters.glsl?raw'
import types from './shaders/types.glsl?raw'

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface CloudsMaterialParameters {
  parameterUniforms: CloudParameterUniforms
  layerUniforms: CloudLayerUniforms
  atmosphereUniforms: AtmosphereUniforms
}

export interface CloudsMaterialUniforms
  extends CloudParameterUniforms,
    CloudLayerUniforms,
    AtmosphereUniforms {
  depthBuffer: Uniform<Texture | null>
  viewMatrix: Uniform<Matrix4>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  reprojectionMatrix: Uniform<Matrix4>
  viewReprojectionMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  cameraHeight: Uniform<number>
  frame: Uniform<number>
  temporalJitter: Uniform<Vector2>
  targetUvScale: Uniform<Vector2>
  mipLevelScale: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>

  // Scattering
  skyLightScale: Uniform<number>
  groundBounceScale: Uniform<number>
  powderScale: Uniform<number>
  powderExponent: Uniform<number>

  // Primary raymarch
  maxIterationCount: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  maxRayDistance: Uniform<number>
  perspectiveStepScale: Uniform<number>
  minDensity: Uniform<number>
  minExtinction: Uniform<number>
  minTransmittance: Uniform<number>

  // Secondary raymarch
  maxIterationCountToSun: Uniform<number>
  maxIterationCountToGround: Uniform<number>
  minSecondaryStepSize: Uniform<number>
  secondaryStepScale: Uniform<number>

  // Beer shadow map
  shadowBuffer: Uniform<DataArrayTexture | null>
  shadowTexelSize: Uniform<Vector2>
  shadowIntervals: Uniform<Vector2[]>
  shadowMatrices: Uniform<Matrix4[]>
  shadowFar: Uniform<number>
  maxShadowFilterRadius: Uniform<number>

  // Shadow length
  maxShadowLengthIterationCount: Uniform<number>
  minShadowLengthStepSize: Uniform<number>
  maxShadowLengthRayDistance: Uniform<number>

  // Haze
  hazeDensityScale: Uniform<number>
  hazeExponent: Uniform<number>
  hazeScatteringCoefficient: Uniform<number>
  hazeAbsorptionCoefficient: Uniform<number>
}

export class CloudsMaterial extends AtmosphereMaterialBase {
  declare uniforms: AtmosphereMaterialBaseUniforms & CloudsMaterialUniforms

  temporalUpscale = true

  private previousProjectionMatrix?: Matrix4
  private previousViewMatrix?: Matrix4

  constructor(
    {
      parameterUniforms,
      layerUniforms,
      atmosphereUniforms
    }: CloudsMaterialParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super(
      {
        name: 'CloudsMaterial',
        glslVersion: GLSL3,
        vertexShader: resolveIncludes(vertexShader, {
          atmosphere: {
            bruneton: {
              common,
              definitions,
              runtime
            }
          },
          types
        }),
        fragmentShader: unrollLoops(
          resolveIncludes(fragmentShader, {
            core: {
              depth,
              math,
              turbo,
              generators,
              raySphereIntersection,
              cascadedShadowMaps,
              interleavedGradientNoise,
              vogelDisk
            },
            atmosphere: {
              bruneton: {
                common,
                definitions,
                runtime
              }
            },
            types,
            parameters,
            clouds
          })
        ),
        // prettier-ignore
        uniforms: {
          ...parameterUniforms,
          ...layerUniforms,
          ...atmosphereUniforms,

          depthBuffer: new Uniform(null),
          viewMatrix: new Uniform(new Matrix4()),
          inverseProjectionMatrix: new Uniform(new Matrix4()),
          inverseViewMatrix: new Uniform(new Matrix4()),
          reprojectionMatrix: new Uniform(new Matrix4()),
          viewReprojectionMatrix: new Uniform(new Matrix4()),
          resolution: new Uniform(new Vector2()),
          cameraNear: new Uniform(0),
          cameraFar: new Uniform(0),
          cameraHeight: new Uniform(0),
          frame: new Uniform(0),
          temporalJitter: new Uniform(new Vector2()),
          targetUvScale: new Uniform(new Vector2()),
          mipLevelScale: new Uniform(1),
          stbnTexture: new Uniform(null),

          // Scattering
          skyLightScale: new Uniform(1),
          groundBounceScale: new Uniform(1),
          powderScale: new Uniform(0.8),
          powderExponent: new Uniform(150),

          // Primary raymarch
          maxIterationCount: new Uniform(defaults.clouds.maxIterationCount),
          minStepSize: new Uniform(defaults.clouds.minStepSize),
          maxStepSize: new Uniform(defaults.clouds.maxStepSize),
          maxRayDistance: new Uniform(defaults.clouds.maxRayDistance),
          perspectiveStepScale: new Uniform(defaults.clouds.perspectiveStepScale),
          minDensity: new Uniform(defaults.clouds.minDensity),
          minExtinction: new Uniform(defaults.clouds.minExtinction),
          minTransmittance: new Uniform(defaults.clouds.minTransmittance),

          // Secondary raymarch
          maxIterationCountToSun: new Uniform(defaults.clouds.maxIterationCountToSun),
          maxIterationCountToGround: new Uniform(defaults.clouds.maxIterationCountToGround),
          minSecondaryStepSize: new Uniform(defaults.clouds.minSecondaryStepSize),
          secondaryStepScale: new Uniform(defaults.clouds.secondaryStepScale),

          // Beer shadow map
          shadowBuffer: new Uniform(null),
          shadowTexelSize: new Uniform(new Vector2()),
          shadowIntervals: new Uniform(
            Array.from({ length: 4 }, () => new Vector2()) // Populate the max number of elements
          ),
          shadowMatrices: new Uniform(
            Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
          ),
          shadowFar: new Uniform(0),
          maxShadowFilterRadius: new Uniform(6),
          shadowLayerMask: new Uniform(new Vector4().setScalar(1)), // Disable mask

          // Shadow length
          maxShadowLengthIterationCount: new Uniform(defaults.clouds.maxShadowLengthIterationCount),
          minShadowLengthStepSize: new Uniform(defaults.clouds.minShadowLengthStepSize),
          maxShadowLengthRayDistance: new Uniform(defaults.clouds.maxShadowLengthRayDistance),

          // Haze
          hazeDensityScale: new Uniform(3e-5),
          hazeExponent: new Uniform(1e-3),
          hazeScatteringCoefficient: new Uniform(0.9),
          hazeAbsorptionCoefficient: new Uniform(0.5),
        } satisfies Partial<AtmosphereMaterialBaseUniforms> &
          CloudsMaterialUniforms
      },
      atmosphere
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
    // Disable onBeforeRender in AtmosphereMaterialBase because we're rendering
    // into fullscreen quad with another camera for the scene projection.

    const prevLogarithmicDepthBuffer =
      this.defines.USE_LOGARITHMIC_DEPTH_BUFFER != null
    const nextLogarithmicDepthBuffer =
      renderer.capabilities.logarithmicDepthBuffer
    if (nextLogarithmicDepthBuffer !== prevLogarithmicDepthBuffer) {
      if (nextLogarithmicDepthBuffer) {
        this.defines.USE_LOGARITHMIC_DEPTH_BUFFER = '1'
      } else {
        delete this.defines.USE_LOGARITHMIC_DEPTH_BUFFER
      }
    }

    const prevPowder = this.defines.POWDER != null
    const nextPowder = this.uniforms.powderScale.value > 0
    if (nextPowder !== prevPowder) {
      if (nextPowder) {
        this.defines.POWDER = '1'
      } else {
        delete this.defines.POWDER
      }
      this.needsUpdate = true
    }

    const prevGroundIrradiance = this.defines.GROUND_BOUNCE != null
    const nextGroundIrradiance =
      this.uniforms.groundBounceScale.value > 0 &&
      this.uniforms.maxIterationCountToGround.value > 0
    if (nextGroundIrradiance !== prevGroundIrradiance) {
      if (nextPowder) {
        this.defines.GROUND_BOUNCE = '1'
      } else {
        delete this.defines.GROUND_BOUNCE
      }
      this.needsUpdate = true
    }
  }

  override copyCameraSettings(camera: Camera): void {
    // Intentionally omit the call to super.

    if (camera.isPerspectiveCamera === true) {
      if (this.defines.PERSPECTIVE_CAMERA !== '1') {
        this.defines.PERSPECTIVE_CAMERA = '1'
        this.needsUpdate = true
      }
    } else {
      if (this.defines.PERSPECTIVE_CAMERA != null) {
        delete this.defines.PERSPECTIVE_CAMERA
        this.needsUpdate = true
      }
    }

    const uniforms = this.uniforms
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)

    const previousProjectionMatrix =
      this.previousProjectionMatrix ?? camera.projectionMatrix
    const previousViewMatrix =
      this.previousViewMatrix ?? camera.matrixWorldInverse

    const inverseProjectionMatrix = uniforms.inverseProjectionMatrix.value
    const inverseViewMatrix = uniforms.inverseViewMatrix.value
    const reprojectionMatrix = uniforms.reprojectionMatrix.value
    const viewReprojectionMatrix = uniforms.viewReprojectionMatrix.value
    if (this.temporalUpscale) {
      const frame = uniforms.frame.value % 16
      const resolution = uniforms.resolution.value
      const offset = bayerOffsets[frame]
      const dx = ((offset.x - 0.5) / resolution.x) * 4
      const dy = ((offset.y - 0.5) / resolution.y) * 4
      uniforms.temporalJitter.value.set(dx, dy)
      uniforms.mipLevelScale.value = 0.25 // NOTE: Not exactly
      inverseProjectionMatrix.copy(camera.projectionMatrix)
      inverseProjectionMatrix.elements[8] += dx * 2
      inverseProjectionMatrix.elements[9] += dy * 2
      inverseProjectionMatrix.invert()

      // Jitter the previous projection matrix with the current jitter.
      reprojectionMatrix.copy(previousProjectionMatrix)
      reprojectionMatrix.elements[8] += dx * 2
      reprojectionMatrix.elements[9] += dy * 2
      reprojectionMatrix.multiply(previousViewMatrix)
      viewReprojectionMatrix
        .copy(reprojectionMatrix)
        .multiply(inverseViewMatrix)
    } else {
      uniforms.temporalJitter.value.setScalar(0)
      uniforms.mipLevelScale.value = 1
      inverseProjectionMatrix.copy(camera.projectionMatrixInverse)
      reprojectionMatrix
        .copy(previousProjectionMatrix)
        .multiply(previousViewMatrix)
      viewReprojectionMatrix
        .copy(reprojectionMatrix)
        .multiply(inverseViewMatrix)
    }

    reinterpretType<PerspectiveCamera | OrthographicCamera>(camera)
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far

    const cameraPosition = camera.getWorldPosition(
      uniforms.cameraPosition.value
    )
    const cameraPositionECEF = vectorScratch
      .copy(cameraPosition)
      .applyMatrix4(uniforms.worldToECEFMatrix.value)

    try {
      uniforms.cameraHeight.value =
        geodeticScratch.setFromECEF(cameraPositionECEF).height
    } catch (error) {
      // Abort when unable to project position to the ellipsoid surface.
    }
  }

  // copyCameraSettings can be called multiple times within a frame. Only
  // reliable way is to explicitly store the matrices.
  copyReprojectionMatrix(camera: Camera): void {
    this.previousProjectionMatrix ??= new Matrix4()
    this.previousViewMatrix ??= new Matrix4()
    this.previousProjectionMatrix.copy(camera.projectionMatrix)
    this.previousViewMatrix.copy(camera.matrixWorldInverse)
  }

  setSize(
    width: number,
    height: number,
    targetWidth?: number,
    targetHeight?: number
  ): void {
    this.uniforms.resolution.value.set(width, height)
    if (targetWidth != null && targetHeight != null) {
      // The size of the high-resolution target buffer differs from the upscaled
      // resolution, which is a multiple of 4. This must be corrected when
      // reading from the depth buffer.
      this.uniforms.targetUvScale.value.set(
        width / targetWidth,
        height / targetHeight
      )
    } else {
      this.uniforms.targetUvScale.value.setScalar(1)
    }

    // Invalidate reprojection.
    this.previousProjectionMatrix = undefined
    this.previousViewMatrix = undefined
  }

  setShadowSize(width: number, height: number): void {
    this.uniforms.shadowTexelSize.value.set(1 / width, 1 / height)
  }

  get depthBuffer(): Texture | null {
    return this.uniforms.depthBuffer.value
  }

  set depthBuffer(value: Texture | null) {
    this.uniforms.depthBuffer.value = value
  }

  @defineInt('DEPTH_PACKING')
  depthPacking = 0

  @defineExpression('LOCAL_WEATHER_CHANNELS', {
    validate: value => /^[rgba]{4}$/.test(value)
  })
  localWeatherChannels = 'rgba'

  @define('SHAPE_DETAIL')
  shapeDetail: boolean = defaults.shapeDetail

  @define('TURBULENCE')
  turbulence: boolean = defaults.turbulence

  @define('SHADOW_LENGTH')
  shadowLength: boolean = defaults.lightShafts

  @define('HAZE')
  haze: boolean = defaults.haze

  @defineInt('MULTI_SCATTERING_OCTAVES', { min: 1, max: 12 })
  multiScatteringOctaves: number = defaults.clouds.multiScatteringOctaves

  /** @deprecated Use accurateSunSkyLight instead. */
  get accurateSunSkyIrradiance(): boolean {
    return this.accurateSunSkyLight
  }

  /** @deprecated Use accurateSunSkyLight instead. */
  set accurateSunSkyIrradiance(value: boolean) {
    this.accurateSunSkyLight = value
  }

  @define('ACCURATE_SUN_SKY_LIGHT')
  accurateSunSkyLight: boolean = defaults.clouds.accurateSunSkyLight

  @define('ACCURATE_PHASE_FUNCTION')
  accuratePhaseFunction: boolean = defaults.clouds.accuratePhaseFunction

  @defineInt('SHADOW_CASCADE_COUNT', { min: 1, max: 4 })
  shadowCascadeCount: number = defaults.shadow.cascadeCount

  @defineInt('SHADOW_SAMPLE_COUNT', { min: 1, max: 16 })
  shadowSampleCount = 8

  // Ideally these should be uniforms, but perhaps due to the phase function
  // is highly optimizable and used many times, defining them as macros
  // improves fps by around 2-4, depending on the condition, though.
  @defineFloat('SCATTER_ANISOTROPY_1')
  scatterAnisotropy1 = 0.7

  @defineFloat('SCATTER_ANISOTROPY_2')
  scatterAnisotropy2 = -0.2

  @defineFloat('SCATTER_ANISOTROPY_MIX')
  scatterAnisotropyMix = 0.5
}
