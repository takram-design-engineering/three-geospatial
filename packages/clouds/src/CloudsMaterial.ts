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
  getAltitudeCorrectionOffset,
  type AtmosphereMaterialBaseUniforms
} from '@takram/three-atmosphere'
import {
  parameters as atmosphereParameters,
  functions
} from '@takram/three-atmosphere/shaders'
import {
  assertType,
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
import {
  createCloudLayerUniforms,
  createCloudParameterUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

import fragmentShader from './shaders/clouds.frag?raw'
import clouds from './shaders/clouds.glsl?raw'
import vertexShader from './shaders/clouds.vert?raw'
import parameters from './shaders/parameters.glsl?raw'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface CloudsMaterialParameters {
  ellipsoidCenterRef?: Vector3
  ellipsoidMatrixRef?: Matrix4
  sunDirectionRef?: Vector3
}

export interface CloudsMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
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

  // Atmosphere
  bottomRadius: Uniform<number>
  ellipsoidMatrix: Uniform<Matrix4>

  // Scattering
  scatterAnisotropy1: Uniform<number>
  scatterAnisotropy2: Uniform<number>
  scatterAnisotropyMix: Uniform<number>
  skyIrradianceScale: Uniform<number>
  groundIrradianceScale: Uniform<number>
  powderScale: Uniform<number>
  powderExponent: Uniform<number>

  // Primary raymarch
  maxIterations: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  maxRayDistance: Uniform<number>
  minDensity: Uniform<number>
  minExtinction: Uniform<number>
  minTransmittance: Uniform<number>

  // Secondary raymarch
  maxSunIterations: Uniform<number>
  maxGroundIterations: Uniform<number>
  minSecondaryStepSize: Uniform<number>

  // Beer shadow map
  shadowBuffer: Uniform<DataArrayTexture | null>
  shadowTexelSize: Uniform<Vector2>
  shadowIntervals: Uniform<Vector2[]>
  shadowMatrices: Uniform<Matrix4[]>
  shadowFar: Uniform<number>
  shadowFilterRadius: Uniform<number>

  // Shadow length
  maxShadowLengthIterations: Uniform<number>
  minShadowLengthStepSize: Uniform<number>
  maxShadowLengthRayDistance: Uniform<number>
}

export class CloudsMaterial extends AtmosphereMaterialBase {
  declare uniforms: AtmosphereMaterialBaseUniforms & CloudsMaterialUniforms

  readonly ellipsoidMatrix: Matrix4
  temporalUpscale = true

  private previousProjectionMatrix?: Matrix4
  private previousViewMatrix?: Matrix4

  constructor(
    {
      ellipsoidCenterRef = new Vector3(),
      ellipsoidMatrixRef = new Matrix4(),
      sunDirectionRef = new Vector3()
    }: CloudsMaterialParameters = {},
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
          }
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
            parameters,
            clouds
          })
        ),
        uniforms: {
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

          ...createCloudParameterUniforms(),
          ...createCloudLayerUniforms(),

          // Atmosphere
          bottomRadius: new Uniform(atmosphere.bottomRadius),
          ellipsoidCenter: new Uniform(ellipsoidCenterRef), // Overridden
          ellipsoidMatrix: new Uniform(ellipsoidMatrixRef),
          sunDirection: new Uniform(sunDirectionRef), // Overridden

          // Scattering
          scatterAnisotropy1: new Uniform(0.7),
          scatterAnisotropy2: new Uniform(-0.2),
          scatterAnisotropyMix: new Uniform(0.5),
          skyIrradianceScale: new Uniform(2.5),
          groundIrradianceScale: new Uniform(3),
          powderScale: new Uniform(0.8),
          powderExponent: new Uniform(150),

          // Primary raymarch
          maxIterations: new Uniform(500),
          minStepSize: new Uniform(50),
          maxStepSize: new Uniform(1000),
          maxRayDistance: new Uniform(5e5),
          perspectiveStepScale: new Uniform(1.01),
          minDensity: new Uniform(1e-5),
          minExtinction: new Uniform(1e-5),
          minTransmittance: new Uniform(1e-2),

          // Secondary raymarch
          maxSunIterations: new Uniform(3),
          maxGroundIterations: new Uniform(2),
          minSecondaryStepSize: new Uniform(100),
          secondaryStepScale: new Uniform(2),

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
          shadowFilterRadius: new Uniform(6),

          // Shadow length
          maxShadowLengthIterations: new Uniform(500),
          minShadowLengthStepSize: new Uniform(50),
          maxShadowLengthRayDistance: new Uniform(5e5)
        } satisfies Partial<AtmosphereMaterialBaseUniforms> &
          CloudsMaterialUniforms,
        defines: {
          DEPTH_PACKING: '0',
          SHAPE_DETAIL: '1',
          TURBULENCE: '1',
          ACCURATE_SUN_SKY_IRRADIANCE: '1',
          MULTI_SCATTERING_OCTAVES: '8',
          POWDER: '1',
          GROUND_IRRADIANCE: '1',
          SHADOW_CASCADE_COUNT: '1',
          SHADOW_LENGTH: '1'
        }
      },
      atmosphere
    )
    this.ellipsoidMatrix = ellipsoidMatrixRef
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
  }

  override copyCameraSettings(camera: Camera): void {
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
    const inverseEllipsoidMatrix = uniforms.inverseEllipsoidMatrix.value
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = vectorScratch
      .copy(cameraPosition)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(uniforms.ellipsoidCenter.value)

    try {
      uniforms.cameraHeight.value =
        geodeticScratch.setFromECEF(cameraPositionECEF).height
    } catch (error) {
      // Abort when unable to project position to the ellipsoid surface.
    }

    const altitudeCorrection = uniforms.altitudeCorrection.value
    if (this.correctAltitude) {
      getAltitudeCorrectionOffset(
        cameraPositionECEF,
        this.atmosphere.bottomRadius,
        this.ellipsoid,
        altitudeCorrection,
        false
      )
    } else {
      altitudeCorrection.setScalar(0)
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
    return +this.defines.DEPTH_PACKING
  }

  set depthPacking(value: number) {
    if (value !== this.depthPacking) {
      this.defines.DEPTH_PACKING = `${value}`
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

  get multiScatteringOctaves(): number {
    return +this.defines.MULTI_SCATTERING_OCTAVES
  }

  set multiScatteringOctaves(value: number) {
    if (value !== this.multiScatteringOctaves) {
      this.defines.MULTI_SCATTERING_OCTAVES = `${value}`
      this.needsUpdate = true
    }
  }

  get powder(): boolean {
    return this.defines.POWDER != null
  }

  set powder(value: boolean) {
    if (value !== this.powder) {
      if (value) {
        this.defines.POWDER = '1'
      } else {
        delete this.defines.POWDER
      }
      this.needsUpdate = true
    }
  }

  get groundIrradiance(): boolean {
    return this.defines.GROUND_IRRADIANCE != null
  }

  set groundIrradiance(value: boolean) {
    if (value !== this.groundIrradiance) {
      if (value) {
        this.defines.GROUND_IRRADIANCE = '1'
      } else {
        delete this.defines.GROUND_IRRADIANCE
      }
      this.needsUpdate = true
    }
  }

  get shadowCascadeCount(): number {
    return +this.defines.SHADOW_CASCADE_COUNT
  }

  set shadowCascadeCount(value: number) {
    if (value !== this.shadowCascadeCount) {
      this.defines.SHADOW_CASCADE_COUNT = `${value}`
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
}
