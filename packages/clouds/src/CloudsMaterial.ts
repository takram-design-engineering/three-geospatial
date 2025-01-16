/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import {
  Color,
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
  Geodetic,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import {
  depth,
  generators,
  math,
  raySphereIntersection
} from '@takram/three-geospatial/shaders'

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

const geodeticScratch = /*#__PURE__*/ new Geodetic()

const bayerIndices = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const bayerOffsets = /*#__PURE__*/ bayerIndices.reduce<Vector2[]>(
  (result, _, index) => {
    const offset = new Vector2()
    for (let i = 0; i < 16; ++i) {
      if (bayerIndices[i] === index) {
        offset.set(((i % 4) + 0.5) / 4, (Math.floor(i / 4) + 0.5) / 4)
        break
      }
    }
    return [...result, offset]
  },
  []
)

export interface CloudsMaterialParameters {
  sunDirectionRef?: Vector3
  localWeatherTexture?: Texture | null
  shapeTexture?: Texture | null
  shapeDetailTexture?: Texture | null
  shadowBuffer?: DataArrayTexture | null
}

interface CloudsMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
  [key: string]: Uniform<unknown>
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
  stbnTexture: Uniform<Data3DTexture | null>

  // Atmospheric parameters
  bottomRadius: Uniform<number>

  // Scattering parameters
  albedo: Uniform<Color>
  scatterAnisotropy1: Uniform<number>
  scatterAnisotropy2: Uniform<number>
  scatterAnisotropyMix: Uniform<number>
  skyIrradianceScale: Uniform<number>
  powderScale: Uniform<number>
  powderExponent: Uniform<number>

  // Raymarch to clouds
  maxIterations: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  maxRayDistance: Uniform<number>

  // Beer shadow map
  shadowBuffer: Uniform<DataArrayTexture | null>
  shadowTexelSize: Uniform<Vector2>
  shadowIntervals: Uniform<Vector2[]>
  shadowMatrices: Uniform<Matrix4[]>
  shadowFar: Uniform<number>
  shadowFilterRadius: Uniform<number>
}

export interface CloudsMaterial {
  uniforms: CloudsMaterialUniforms & AtmosphereMaterialBaseUniforms
}

export class CloudsMaterial extends AtmosphereMaterialBase {
  temporalUpscaling = false

  private previousProjectionMatrix?: Matrix4
  private previousViewMatrix?: Matrix4

  constructor(
    {
      sunDirectionRef,
      localWeatherTexture = null,
      shapeTexture = null,
      shapeDetailTexture = null,
      shadowBuffer = null
    }: CloudsMaterialParameters = {},
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super(
      {
        name: 'CloudsMaterial',
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: unrollLoops(
          resolveIncludes(fragmentShader, {
            core: {
              depth,
              math,
              generators,
              raySphereIntersection
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
          stbnTexture: new Uniform(null),

          ...createCloudParameterUniforms({
            localWeatherTexture,
            shapeTexture,
            shapeDetailTexture
          }),
          ...createCloudLayerUniforms(),

          // Atmospheric parameters
          bottomRadius: new Uniform(atmosphere.bottomRadius),
          sunDirection: new Uniform(sunDirectionRef ?? new Vector3()), // Overridden

          // Scattering parameters
          albedo: new Uniform(new Color().setScalar(0.98)),
          powderScale: new Uniform(0.8),
          powderExponent: new Uniform(200),
          scatterAnisotropy1: new Uniform(0.8),
          scatterAnisotropy2: new Uniform(-0.3),
          scatterAnisotropyMix: new Uniform(0.5),
          skyIrradianceScale: new Uniform(0.3),
          groundIrradianceScale: new Uniform(0.7),

          // Raymarch to clouds
          maxIterations: new Uniform(500),
          minStepSize: new Uniform(50),
          maxStepSize: new Uniform(1000),
          maxRayDistance: new Uniform(1.5e5),

          // Beer shadow map
          shadowBuffer: new Uniform(shadowBuffer),
          shadowTexelSize: new Uniform(new Vector2()),
          shadowIntervals: new Uniform(
            Array.from({ length: 4 }, () => new Vector2()) // Populate the max number of elements
          ),
          shadowMatrices: new Uniform(
            Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
          ),
          shadowFar: new Uniform(0),
          shadowFilterRadius: new Uniform(0)
        } satisfies CloudsMaterialUniforms,
        defines: {
          DEPTH_PACKING: '0',
          SHAPE_DETAIL: '1',
          MULTI_SCATTERING_OCTAVES: '8',
          POWDER: '1',
          GROUND_IRRADIANCE: '1',
          SHADOW_CASCADE_COUNT: '1'
        }
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
  }

  override copyCameraSettings(camera: Camera): void {
    super.copyCameraSettings(camera)

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
    if (this.temporalUpscaling) {
      const frame = uniforms.frame.value % 16
      const resolution = uniforms.resolution.value
      const offset = bayerOffsets[frame]
      const dx = ((offset.x - 0.5) / resolution.x) * 4
      const dy = ((offset.y - 0.5) / resolution.y) * 4
      uniforms.temporalJitter.value.set(dx, dy)
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
      inverseProjectionMatrix.copy(camera.projectionMatrixInverse)
      reprojectionMatrix
        .copy(previousProjectionMatrix)
        .multiply(previousViewMatrix)
    }

    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far

    const cameraHeight = uniforms.cameraHeight
    const position = uniforms.cameraPosition.value
    try {
      cameraHeight.value = geodeticScratch.setFromECEF(position).height
    } catch (error) {
      // Abort when the position is zero.
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

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)

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

  get useShapeDetail(): boolean {
    return this.defines.SHAPE_DETAIL != null
  }

  // TODO: Remove this and make parametric uniform instead
  set useShapeDetail(value: boolean) {
    if (value !== this.useShapeDetail) {
      if (value) {
        this.defines.SHAPE_DETAIL = '1'
      } else {
        delete this.defines.SHAPE_DETAIL
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

  get usePowder(): boolean {
    return this.defines.POWDER != null
  }

  // TODO: Remove this and make parametric uniform instead
  set usePowder(value: boolean) {
    if (value !== this.usePowder) {
      if (value) {
        this.defines.POWDER = '1'
      } else {
        delete this.defines.POWDER
      }
      this.needsUpdate = true
    }
  }

  get useGroundIrradiance(): boolean {
    return this.defines.GROUND_IRRADIANCE != null
  }

  // TODO: Remove this and make parametric uniform instead
  set useGroundIrradiance(value: boolean) {
    if (value !== this.useGroundIrradiance) {
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
}
