import {
  DepthPackingStrategies,
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
  resolveIncludes,
  TemporalMaterial,
  unrollLoops
} from '@takram/three-geospatial'
import {
  cascadedShadow,
  depth,
  generators,
  interleavedGradientNoise,
  math,
  raySphereIntersection,
  turbo,
  vogelDisk
} from '@takram/three-geospatial/shaders'

import { defaults } from './qualityPresets'
import type {
  AtmosphereUniforms,
  CloudLayerUniforms,
  CloudParameterUniforms
} from './uniforms'

import clouds from './shaders/clouds.glsl?raw'
import fragmentShader from './shaders/cloudsMaterial.frag?raw'
import vertexShader from './shaders/cloudsMaterial.vert?raw'
import parameters from './shaders/parameters.glsl?raw'
import types from './shaders/types.glsl?raw'

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

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
  cameraHeight: Uniform<number>
  mipLevelScale: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>

  // Temporal material uniforms
  reprojectionMatrix: Uniform<Matrix4>
  viewReprojectionMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  frame: Uniform<number>
  temporalJitterUv: Uniform<Vector2>
  targetUvScale: Uniform<Vector2>

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
  shadowCascadeCount: Uniform<number>
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

export class CloudsMaterial
  extends AtmosphereMaterialBase
  implements TemporalMaterial
{
  declare uniforms: AtmosphereMaterialBaseUniforms & CloudsMaterialUniforms

  temporalUpscale = true

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
              cascadedShadow,
              depth,
              generators,
              interleavedGradientNoise,
              math,
              raySphereIntersection,
              turbo,
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

          viewMatrix: new Uniform(new Matrix4()),
          inverseProjectionMatrix: new Uniform(new Matrix4()),
          inverseViewMatrix: new Uniform(new Matrix4()),
          depthBuffer: new Uniform(null),
          cameraHeight: new Uniform(0),
          mipLevelScale: new Uniform(1),
          stbnTexture: new Uniform(null),

          // Temporal material uniforms
          reprojectionMatrix: new Uniform(new Matrix4()),
          viewReprojectionMatrix: new Uniform(new Matrix4()),
          resolution: new Uniform(new Vector2()),
          cameraNear: new Uniform(0),
          cameraFar: new Uniform(0),
          frame: new Uniform(0),
          temporalJitterUv: new Uniform(new Vector2()),
          targetUvScale: new Uniform(new Vector2()),

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
          shadowCascadeCount: new Uniform(defaults.shadow.cascadeCount),
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

    const uniforms = this.uniforms
    this._logarithmicDepthBuffer = renderer.capabilities.logarithmicDepthBuffer
    this._powder = uniforms.powderScale.value > 0
    this._groundBounce =
      uniforms.groundBounceScale.value > 0 &&
      uniforms.maxIterationCountToGround.value > 0
  }

  override copyCameraSettings(camera: Camera): void {
    super.copyCameraSettings(camera)

    this._perspectiveCamera = camera.isPerspectiveCamera === true

    const uniforms = this.uniforms
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)

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

  setShadowSize(width: number, height: number): void {
    this.uniforms.shadowTexelSize.value.set(1 / width, 1 / height)
  }

  get depthBuffer(): Texture | null {
    return this.uniforms.depthBuffer.value
  }

  set depthBuffer(value: Texture | null) {
    this.uniforms.depthBuffer.value = value
  }

  /** @private */
  @define('PERSPECTIVE_CAMERA')
  _perspectiveCamera = false

  /** @private */
  @define('USE_LOGDEPTHBUF')
  _logarithmicDepthBuffer = false

  /** @private */
  @define('POWDER')
  _powder = false

  /** @private */
  @define('GROUND_BOUNCE')
  _groundBounce = false

  @defineInt('DEPTH_PACKING')
  depthPacking: DepthPackingStrategies | 0 = 0

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

  @define('ACCURATE_SUN_SKY_LIGHT')
  accurateSunSkyLight: boolean = defaults.clouds.accurateSunSkyLight

  @define('ACCURATE_PHASE_FUNCTION')
  accuratePhaseFunction: boolean = defaults.clouds.accuratePhaseFunction

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
