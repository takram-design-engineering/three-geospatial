/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

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
}

interface ShadowMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
  [key: string]: Uniform<unknown>
  inverseShadowMatrices: Uniform<Matrix4[]>
  reprojectionMatrices: Uniform<Matrix4[]>
  resolution: Uniform<Vector2>
  frame: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>

  // Atmospheric parameters
  bottomRadius: Uniform<number>
  ellipsoidCenter: Uniform<Vector3>
  inverseEllipsoidMatrix: Uniform<Matrix4>
  altitudeCorrection: Uniform<Vector3>
  sunDirection: Uniform<Vector3>

  // Raymarch to clouds
  maxIterations: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
}

export interface ShadowMaterial {
  uniforms: ShadowMaterialUniforms
}

export class ShadowMaterial extends RawShaderMaterial {
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
      shapeDetailTexture = null
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
          shapeDetailTexture
        }),
        ...createCloudLayerUniforms(),

        // Atmospheric parameters
        bottomRadius: new Uniform(atmosphere.bottomRadius),
        ellipsoidCenter: new Uniform(ellipsoidCenterRef),
        ellipsoidMatrix: new Uniform(ellipsoidMatrixRef),
        inverseEllipsoidMatrix: new Uniform(new Matrix4()),
        altitudeCorrection: new Uniform(new Vector3()),
        sunDirection: new Uniform(sunDirectionRef),

        // Raymarch to clouds
        maxIterations: new Uniform(50),
        minStepSize: new Uniform(100),
        maxStepSize: new Uniform(1000)
      } satisfies ShadowMaterialUniforms,
      defines: {
        SHAPE_DETAIL: '1'
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

  // TODO: Remove this and make parametric uniform instead
  get useShapeDetail(): boolean {
    return this.defines.SHAPE_DETAIL != null
  }

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
}
