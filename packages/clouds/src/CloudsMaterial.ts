/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import {
  Color,
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  Vector4,
  type BufferGeometry,
  type Camera,
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
  atmosphereMaterialParametersBaseDefaults,
  AtmosphereParameters,
  type AtmosphereMaterialBaseParameters,
  type AtmosphereMaterialBaseUniforms
} from '@takram/three-atmosphere'
import {
  parameters as atmosphereParameters,
  functions
} from '@takram/three-atmosphere/shaders'
import { assertType, Geodetic, resolveIncludes } from '@takram/three-geospatial'
import { depth, math } from '@takram/three-geospatial/shaders'

import { STBN_TEXTURE_DEPTH, STBN_TEXTURE_SIZE } from './constants'
import {
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

export interface CloudsMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  depthBuffer?: Texture | null
}

export const cloudsMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults
} satisfies CloudsMaterialParameters

interface CloudsMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
  [key: string]: Uniform
  depthBuffer: Uniform<Texture | null>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  cameraHeight: Uniform<number>
  frame: Uniform<number>
  time: Uniform<number>
  blueNoiseTexture: Uniform<Texture | null>

  // Atmospheric parameters
  bottomRadius: Uniform<number> // TODO

  // Scattering parameters
  albedo: Uniform<Color>
  powderScale: Uniform<number>
  powderExponent: Uniform<number>
  scatterAnisotropy1: Uniform<number>
  scatterAnisotropy2: Uniform<number>
  scatterAnisotropyMix: Uniform<number>
  skyIrradianceScale: Uniform<number>

  // Raymarch to clouds
  maxIterations: Uniform<number>
  initialStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  maxRayDistance: Uniform<number>
  minDensity: Uniform<number>
  minTransmittance: Uniform<number>

  // Beer shadow map
  shadowBuffer: Uniform<Texture | null>
  shadowMatrix: Uniform<Matrix4>
}

export interface CloudsMaterial {
  uniforms: CloudsMaterialUniforms & AtmosphereMaterialBaseUniforms
}

export class CloudsMaterial extends AtmosphereMaterialBase {
  constructor(
    params?: CloudsMaterialParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const { depthBuffer = null } = {
      ...cloudsMaterialParametersDefaults,
      ...params
    }
    super(
      {
        name: 'CloudsMaterial',
        glslVersion: GLSL3,
        vertexShader,
        fragmentShader: resolveIncludes(fragmentShader, {
          core: {
            depth,
            math
          },
          atmosphere: {
            parameters: atmosphereParameters,
            functions
          },
          parameters,
          clouds
        }),
        uniforms: {
          depthBuffer: new Uniform(depthBuffer),
          inverseProjectionMatrix: new Uniform(new Matrix4()),
          inverseViewMatrix: new Uniform(new Matrix4()),
          resolution: new Uniform(new Vector2()),
          cameraNear: new Uniform(0),
          cameraFar: new Uniform(0),
          cameraHeight: new Uniform(0),
          frame: new Uniform(0),
          time: new Uniform(0),
          blueNoiseTexture: new Uniform(null),

          // Atmospheric parameters
          bottomRadius: new Uniform(atmosphere.bottomRadius), // TODO

          // Cloud parameters
          shapeTexture: new Uniform(null),
          shapeFrequency: new Uniform(0.0003),
          shapeDetailTexture: new Uniform(null),
          shapeDetailFrequency: new Uniform(0.007),
          localWeatherTexture: new Uniform(null),
          localWeatherFrequency: new Uniform(new Vector2(300, 150)),
          coverage: new Uniform(0.3),

          // Scattering parameters
          albedo: new Uniform(new Color(0.98, 0.98, 0.98)),
          powderScale: new Uniform(1),
          powderExponent: new Uniform(200),
          scatterAnisotropy1: new Uniform(0.35),
          scatterAnisotropy2: new Uniform(-0.3),
          scatterAnisotropyMix: new Uniform(0.5),
          skyIrradianceScale: new Uniform(0.1),

          // Cloud layer parameters
          minLayerHeights: new Uniform(new Vector4()),
          maxLayerHeights: new Uniform(new Vector4()),
          extinctionCoeffs: new Uniform(new Vector4()),
          detailAmounts: new Uniform(new Vector4()),
          weatherExponents: new Uniform(new Vector4()),
          coverageFilterWidths: new Uniform(new Vector4()),
          minHeight: new Uniform(0),
          maxHeight: new Uniform(0),

          // Raymarch to clouds
          maxIterations: new Uniform(500),
          initialStepSize: new Uniform(100),
          maxStepSize: new Uniform(1000),
          maxRayDistance: new Uniform(1.5e5),
          minDensity: new Uniform(1e-5),
          minTransmittance: new Uniform(1e-2),

          // Beer shadow map
          shadowBuffer: new Uniform(null),
          shadowMatrix: new Uniform(new Matrix4())
        } satisfies CloudsMaterialUniforms,
        defines: {
          STBN_TEXTURE_SIZE: `${STBN_TEXTURE_SIZE}`,
          STBN_TEXTURE_DEPTH: `${STBN_TEXTURE_DEPTH}`,
          DEPTH_PACKING: '0',
          USE_DETAIL: '1',
          MULTI_SCATTERING_OCTAVES: '8',
          ACCURATE_ATMOSPHERIC_IRRADIANCE: '1' // TODO
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
    const inverseProjectionMatrix = uniforms.inverseProjectionMatrix
    const inverseViewMatrix = uniforms.inverseViewMatrix
    inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    inverseViewMatrix.value.copy(camera.matrixWorld)

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

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)
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

  get useDetail(): boolean {
    return this.defines.USE_DETAIL != null
  }

  set useDetail(value: boolean) {
    if (value !== this.useDetail) {
      if (value) {
        this.defines.USE_DETAIL = '1'
      } else {
        delete this.defines.USE_DETAIL
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
    return this.defines.USE_POWDER != null
  }

  set usePowder(value: boolean) {
    if (value !== this.usePowder) {
      if (value) {
        this.defines.USE_POWDER = '1'
      } else {
        delete this.defines.USE_POWDER
      }
      this.needsUpdate = true
    }
  }
}
