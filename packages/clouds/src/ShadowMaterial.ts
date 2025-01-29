import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type Data3DTexture,
  type Texture
} from 'three'

import {
  AtmosphereParameters,
  getAltitudeCorrectionOffset
} from '@takram/three-atmosphere'
import {
  Ellipsoid,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import { math, raySphereIntersection } from '@takram/three-geospatial/shaders'

import {
  createCloudLayerUniforms,
  createCloudParameterUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

import clouds from './shaders/clouds.glsl?raw'
import parameters from './shaders/parameters.glsl?raw'
import fragmentShader from './shaders/shadow.frag?raw'
import vertexShader from './shaders/shadow.vert?raw'
import structuredSampling from './shaders/structuredSampling.glsl?raw'

const vectorScratch = /*#__PURE__*/ new Vector3()

export interface ShadowMaterialParameters {
  ellipsoidCenterRef?: Vector3
  ellipsoidMatrixRef?: Matrix4
  sunDirectionRef?: Vector3
  localWeatherTexture?: Texture | null
  shapeTexture?: Texture | null
  shapeDetailTexture?: Texture | null
  turbulenceTexture?: Texture | null
}

export interface ShadowMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
  [key: string]: Uniform<unknown>
  inverseShadowMatrices: Uniform<Matrix4[]>
  reprojectionMatrices: Uniform<Matrix4[]>
  resolution: Uniform<Vector2>
  frame: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>

  // Atmosphere
  bottomRadius: Uniform<number>
  ellipsoidCenter: Uniform<Vector3>
  ellipsoidMatrix: Uniform<Matrix4>
  inverseEllipsoidMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>

  // Primary raymarch
  maxIterations: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  minDensity: Uniform<number>
  minExtinction: Uniform<number>
  minTransmittance: Uniform<number>
}

export class ShadowMaterial extends RawShaderMaterial {
  declare uniforms: ShadowMaterialUniforms

  ellipsoid: Ellipsoid
  readonly ellipsoidMatrix: Matrix4
  correctAltitude: boolean

  constructor(
    {
      ellipsoidCenterRef = new Vector3(),
      ellipsoidMatrixRef = new Matrix4(),
      sunDirectionRef = new Vector3(),
      localWeatherTexture = null,
      shapeTexture = null,
      shapeDetailTexture = null,
      turbulenceTexture = null
    }: ShadowMaterialParameters = {},
    private readonly atmosphere = AtmosphereParameters.DEFAULT
  ) {
    super({
      name: 'ShadowMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          core: {
            math,
            raySphereIntersection
          },
          parameters,
          structuredSampling,
          clouds
        })
      ),
      uniforms: {
        inverseShadowMatrices: new Uniform(
          Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
        ),
        reprojectionMatrices: new Uniform(
          Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
        ),
        resolution: new Uniform(new Vector2()),
        frame: new Uniform(0),
        stbnTexture: new Uniform(null),

        ...createCloudParameterUniforms({
          localWeatherTexture,
          shapeTexture,
          shapeDetailTexture,
          turbulenceTexture
        }),
        ...createCloudLayerUniforms(),

        // Atmosphere
        bottomRadius: new Uniform(atmosphere.bottomRadius),
        ellipsoidCenter: new Uniform(ellipsoidCenterRef),
        ellipsoidMatrix: new Uniform(ellipsoidMatrixRef),
        inverseEllipsoidMatrix: new Uniform(new Matrix4()),
        altitudeCorrection: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirectionRef),

        // Primary raymarch
        maxIterations: new Uniform(50),
        minStepSize: new Uniform(100),
        maxStepSize: new Uniform(1000),
        minDensity: new Uniform(1e-5),
        minExtinction: new Uniform(1e-5),
        minTransmittance: new Uniform(1e-4)
      } satisfies ShadowMaterialUniforms,
      defines: {
        TEMPORAL_PASS: '1',
        TEMPORAL_JITTER: '1',
        SHAPE_DETAIL: '1',
        TURBULENCE: '1'
      }
    })

    this.ellipsoid = Ellipsoid.WGS84
    this.ellipsoidMatrix = ellipsoidMatrixRef
    this.correctAltitude = true
    this.cascadeCount = 1
  }

  copyCameraSettings(camera: Camera): void {
    const uniforms = this.uniforms
    const inverseEllipsoidMatrix = uniforms.inverseEllipsoidMatrix.value
      .copy(this.ellipsoidMatrix)
      .invert()
    const cameraPositionECEF = camera
      .getWorldPosition(vectorScratch)
      .applyMatrix4(inverseEllipsoidMatrix)
      .sub(uniforms.ellipsoidCenter.value)

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

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)
  }

  get cascadeCount(): number {
    return +this.defines.CASCADE_COUNT
  }

  set cascadeCount(value: number) {
    if (value !== this.cascadeCount) {
      this.defines.CASCADE_COUNT = `${value}`
      this.needsUpdate = true
    }
  }

  get temporalPass(): boolean {
    return this.defines.TEMPORAL_PASS != null
  }

  set temporalPass(value: boolean) {
    if (value !== this.temporalPass) {
      if (value) {
        this.defines.TEMPORAL_PASS = '1'
      } else {
        delete this.defines.TEMPORAL_PASS
      }
      this.needsUpdate = true
    }
  }

  get temporalJitter(): boolean {
    return this.defines.TEMPORAL_JITTER != null
  }

  set temporalJitter(value: boolean) {
    if (value !== this.temporalJitter) {
      if (value) {
        this.defines.TEMPORAL_JITTER = '1'
      } else {
        delete this.defines.TEMPORAL_JITTER
      }
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
}
