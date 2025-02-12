import {
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
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
  parameters as atmosphereParameters,
  functions
} from '@takram/three-atmosphere/shaders'
import {
  assertType,
  clamp,
  Geodetic,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import {
  cascadedShadowMaps,
  depth,
  generators,
  math,
  poissonDisk,
  raySphereIntersection
} from '@takram/three-geospatial/shaders'

import { bayerOffsets } from './bayer'
import { defaults } from './qualityPresets'
import {
  type AtmosphereUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

import fragmentShader from './shaders/clouds.frag?raw'
import clouds from './shaders/clouds.glsl?raw'
import vertexShader from './shaders/clouds.vert?raw'
import parameters from './shaders/parameters.glsl?raw'
import types from './shaders/types.glsl?raw'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

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
  albedo: Uniform<Vector3>
  skyIrradianceScale: Uniform<number>
  groundIrradianceScale: Uniform<number>
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
  hazeExpScale: Uniform<number>
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
            parameters: atmosphereParameters,
            functions
          },
          types
        }),
        fragmentShader: unrollLoops(
          resolveIncludes(fragmentShader, {
            core: {
              depth,
              math,
              generators,
              raySphereIntersection,
              cascadedShadowMaps,
              poissonDisk
            },
            atmosphere: {
              parameters: atmosphereParameters,
              functions
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
          albedo: new Uniform(new Vector3()),
          skyIrradianceScale: new Uniform(2.5),
          groundIrradianceScale: new Uniform(3),
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

          // Shadow length
          maxShadowLengthIterationCount: new Uniform(defaults.clouds.maxShadowLengthIterationCount),
          minShadowLengthStepSize: new Uniform(defaults.clouds.minShadowLengthStepSize),
          maxShadowLengthRayDistance: new Uniform(defaults.clouds.maxShadowLengthRayDistance),

          // Haze
          hazeDensityScale: new Uniform(3e-5),
          hazeExpScale: new Uniform(1e-3)
        } satisfies Partial<AtmosphereMaterialBaseUniforms> &
          CloudsMaterialUniforms,
        defines: {
          DEPTH_PACKING: '0'
        }
      },
      atmosphere
    )

    // Ideally these should be uniforms, but perhaps due to the phase function
    // is highly optimizable and used many times, defining them as macros
    // improves performance by around 3-4 fps, depending on the device, though.
    this.scatterAnisotropy1 = 0.7
    this.scatterAnisotropy2 = -0.2
    this.scatterAnisotropyMix = 0.5

    this.shapeDetail = defaults.shapeDetail
    this.turbulence = defaults.turbulence
    this.haze = defaults.haze
    this.shadowLength = defaults.lightShafts
    this.multiScatteringOctaves = defaults.clouds.multiScatteringOctaves
    this.accurateSunSkyIrradiance = defaults.clouds.accurateSunSkyIrradiance
    this.accuratePhaseFunction = defaults.clouds.accuratePhaseFunction
    this.shadowCascadeCount = defaults.shadow.cascadeCount
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
    uniforms.albedo.value.setScalar(
      uniforms.scatteringCoefficient.value /
        (uniforms.absorptionCoefficient.value +
          uniforms.scatteringCoefficient.value)
    )

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

    const prevGroundIrradiance = this.defines.GROUND_IRRADIANCE != null
    const nextGroundIrradiance =
      this.uniforms.groundIrradianceScale.value > 0 &&
      this.uniforms.maxIterationCountToGround.value > 0
    if (nextGroundIrradiance !== prevGroundIrradiance) {
      if (nextPowder) {
        this.defines.GROUND_IRRADIANCE = '1'
      } else {
        delete this.defines.GROUND_IRRADIANCE
      }
      this.needsUpdate = true
    }
  }

  override copyCameraSettings(camera: Camera): void {
    // Intentionally omit the call of super.

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
    const reprojectionMatrix = uniforms.reprojectionMatrix.value
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
    } else {
      uniforms.temporalJitter.value.setScalar(0)
      uniforms.mipLevelScale.value = 1
      inverseProjectionMatrix.copy(camera.projectionMatrixInverse)
      reprojectionMatrix
        .copy(previousProjectionMatrix)
        .multiply(previousViewMatrix)
    }

    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far

    const cameraPosition = camera.getWorldPosition(
      uniforms.cameraPosition.value
    )
    const cameraPositionECEF = vectorScratch
      .copy(cameraPosition)
      .applyMatrix4(uniforms.inverseEllipsoidMatrix.value)
      .sub(uniforms.ellipsoidCenter.value)

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

  get depthPacking(): number {
    return parseInt(this.defines.DEPTH_PACKING)
  }

  set depthPacking(value: number) {
    if (value !== this.depthPacking) {
      this.defines.DEPTH_PACKING = value.toFixed(0)
      this.needsUpdate = true
    }
  }

  get shapeDetail(): boolean {
    return this.defines.SHAPE_DETAIL != null
  }

  set shapeDetail(value: boolean) {
    if (value !== this.shapeDetail) {
      if (value) {
        this.defines.SHAPE_DETAIL = '1'
      } else {
        delete this.defines.SHAPE_DETAIL
      }
      this.needsUpdate = true
    }
  }

  get turbulence(): boolean {
    return this.defines.TURBULENCE != null
  }

  set turbulence(value: boolean) {
    if (value !== this.turbulence) {
      if (value) {
        this.defines.TURBULENCE = '1'
      } else {
        delete this.defines.TURBULENCE
      }
      this.needsUpdate = true
    }
  }

  get shadowLength(): boolean {
    return this.defines.SHADOW_LENGTH != null
  }

  set shadowLength(value: boolean) {
    if (value !== this.shadowLength) {
      if (value) {
        this.defines.SHADOW_LENGTH = '1'
      } else {
        delete this.defines.SHADOW_LENGTH
      }
      this.needsUpdate = true
    }
  }

  get haze(): boolean {
    return this.defines.HAZE != null
  }

  set haze(value: boolean) {
    if (value !== this.haze) {
      if (value) {
        this.defines.HAZE = '1'
      } else {
        delete this.defines.HAZE
      }
      this.needsUpdate = true
    }
  }

  get scatterAnisotropy1(): number {
    return parseFloat(this.defines.SCATTER_ANISOTROPY_1)
  }

  set scatterAnisotropy1(value: number) {
    if (value !== this.scatterAnisotropy1) {
      this.defines.SCATTER_ANISOTROPY_1 = value.toFixed(7)
      this.needsUpdate = true
    }
  }

  get scatterAnisotropy2(): number {
    return parseFloat(this.defines.SCATTER_ANISOTROPY_2)
  }

  set scatterAnisotropy2(value: number) {
    if (value !== this.multiScatteringOctaves) {
      this.defines.SCATTER_ANISOTROPY_2 = value.toFixed(7)
      this.needsUpdate = true
    }
  }

  get scatterAnisotropyMix(): number {
    return parseFloat(this.defines.SCATTER_ANISOTROPY_MIX)
  }

  set scatterAnisotropyMix(value: number) {
    if (value !== this.scatterAnisotropyMix) {
      this.defines.SCATTER_ANISOTROPY_MIX = value.toFixed(7)
      this.needsUpdate = true
    }
  }

  get multiScatteringOctaves(): number {
    return parseInt(this.defines.MULTI_SCATTERING_OCTAVES)
  }

  set multiScatteringOctaves(value: number) {
    if (value !== this.multiScatteringOctaves) {
      this.defines.MULTI_SCATTERING_OCTAVES = clamp(value, 1, 12).toFixed(0)
      this.needsUpdate = true
    }
  }

  get accurateSunSkyIrradiance(): boolean {
    return this.defines.ACCURATE_SUN_SKY_IRRADIANCE != null
  }

  set accurateSunSkyIrradiance(value: boolean) {
    if (value !== this.accurateSunSkyIrradiance) {
      if (value) {
        this.defines.ACCURATE_SUN_SKY_IRRADIANCE = '1'
      } else {
        delete this.defines.ACCURATE_SUN_SKY_IRRADIANCE
      }
      this.needsUpdate = true
    }
  }

  get accuratePhaseFunction(): boolean {
    return this.defines.ACCURATE_PHASE_FUNCTION != null
  }

  set accuratePhaseFunction(value: boolean) {
    if (value !== this.accuratePhaseFunction) {
      if (value) {
        this.defines.ACCURATE_PHASE_FUNCTION = '1'
      } else {
        delete this.defines.ACCURATE_PHASE_FUNCTION
      }
      this.needsUpdate = true
    }
  }

  get shadowCascadeCount(): number {
    return parseInt(this.defines.SHADOW_CASCADE_COUNT)
  }

  set shadowCascadeCount(value: number) {
    if (value !== this.shadowCascadeCount) {
      this.defines.SHADOW_CASCADE_COUNT = value.toFixed(0)
      this.needsUpdate = true
    }
  }
}
