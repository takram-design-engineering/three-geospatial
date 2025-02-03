import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type Data3DTexture
} from 'three'

import { resolveIncludes, unrollLoops } from '@takram/three-geospatial'
import { math, raySphereIntersection } from '@takram/three-geospatial/shaders'

import {
  type AtmosphereUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

import clouds from './shaders/clouds.glsl?raw'
import parameters from './shaders/parameters.glsl?raw'
import fragmentShader from './shaders/shadow.frag?raw'
import vertexShader from './shaders/shadow.vert?raw'
import structuredSampling from './shaders/structuredSampling.glsl?raw'

export interface ShadowMaterialParameters {
  cloudParameterUniforms: CloudParameterUniforms
  cloudLayerUniforms: CloudLayerUniforms
  atmosphereUniforms: AtmosphereUniforms
}

export interface ShadowMaterialUniforms
  extends CloudParameterUniforms,
    CloudLayerUniforms,
    AtmosphereUniforms {
  [key: string]: Uniform<unknown>
  inverseShadowMatrices: Uniform<Matrix4[]>
  reprojectionMatrices: Uniform<Matrix4[]>
  resolution: Uniform<Vector2>
  frame: Uniform<number>
  stbnTexture: Uniform<Data3DTexture | null>

  // Primary raymarch
  maxIterations: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  minDensity: Uniform<number>
  minExtinction: Uniform<number>
  minTransmittance: Uniform<number>
  maxOpticalDepthTailScale: Uniform<number>
}

export class ShadowMaterial extends RawShaderMaterial {
  declare uniforms: ShadowMaterialUniforms

  constructor({
    atmosphereUniforms,
    cloudParameterUniforms,
    cloudLayerUniforms
  }: ShadowMaterialParameters) {
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
        ...cloudParameterUniforms,
        ...cloudLayerUniforms,
        ...atmosphereUniforms,

        inverseShadowMatrices: new Uniform(
          Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
        ),
        reprojectionMatrices: new Uniform(
          Array.from({ length: 4 }, () => new Matrix4()) // Populate the max number of elements
        ),
        resolution: new Uniform(new Vector2()),
        frame: new Uniform(0),
        stbnTexture: new Uniform(null),

        // Primary raymarch
        maxIterations: new Uniform(50),
        minStepSize: new Uniform(100),
        maxStepSize: new Uniform(1000),
        minDensity: new Uniform(1e-5),
        minExtinction: new Uniform(1e-5),
        minTransmittance: new Uniform(1e-4),
        maxOpticalDepthTailScale: new Uniform(2)
      } satisfies ShadowMaterialUniforms,
      defines: {
        TEMPORAL_PASS: '1',
        TEMPORAL_JITTER: '1',
        SHAPE_DETAIL: '1',
        TURBULENCE: '1'
      }
    })

    this.cascadeCount = 1
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
