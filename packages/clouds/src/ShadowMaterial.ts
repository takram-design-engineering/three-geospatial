import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  type Data3DTexture
} from 'three'

import {
  define,
  defineExpression,
  defineInt,
  resolveIncludes,
  unrollLoops
} from '@takram/three-geospatial'
import { math, raySphereIntersection } from '@takram/three-geospatial/shaders'

import { defaults } from './qualityPresets'
import type {
  AtmosphereUniforms,
  CloudLayerUniforms,
  CloudParameterUniforms
} from './uniforms'

import clouds from './shaders/clouds.glsl?raw'
import parameters from './shaders/parameters.glsl?raw'
import fragmentShader from './shaders/shadow.frag?raw'
import vertexShader from './shaders/shadow.vert?raw'
import structuredSampling from './shaders/structuredSampling.glsl?raw'
import types from './shaders/types.glsl?raw'

export interface ShadowMaterialParameters {
  parameterUniforms: CloudParameterUniforms
  layerUniforms: CloudLayerUniforms
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
  maxIterationCount: Uniform<number>
  minStepSize: Uniform<number>
  maxStepSize: Uniform<number>
  minDensity: Uniform<number>
  minExtinction: Uniform<number>
  minTransmittance: Uniform<number>
  opticalDepthTailScale: Uniform<number>
}

export class ShadowMaterial extends RawShaderMaterial {
  declare uniforms: ShadowMaterialUniforms

  constructor({
    parameterUniforms,
    layerUniforms,
    atmosphereUniforms
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
          types,
          parameters,
          structuredSampling,
          clouds
        })
      ),
      uniforms: {
        ...parameterUniforms,
        ...layerUniforms,
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
        maxIterationCount: new Uniform(defaults.shadow.maxIterationCount),
        minStepSize: new Uniform(defaults.shadow.minStepSize),
        maxStepSize: new Uniform(defaults.shadow.maxStepSize),
        minDensity: new Uniform(defaults.shadow.minDensity),
        minExtinction: new Uniform(defaults.shadow.minExtinction),
        minTransmittance: new Uniform(defaults.shadow.minTransmittance),
        opticalDepthTailScale: new Uniform(2)
      } satisfies ShadowMaterialUniforms,
      defines: {
        SHADOW: '1',
        TEMPORAL_PASS: '1',
        TEMPORAL_JITTER: '1'
      }
    })

    this.cascadeCount = defaults.shadow.cascadeCount
  }

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)
  }

  @defineExpression('LOCAL_WEATHER_CHANNELS', {
    validate: value => /^[rgba]{4}$/.test(value)
  })
  localWeatherChannels = 'rgba'

  @defineInt('CASCADE_COUNT', { min: 1, max: 4 })
  cascadeCount: number = defaults.shadow.cascadeCount

  @define('TEMPORAL_PASS')
  temporalPass = true

  @define('TEMPORAL_JITTER')
  temporalJitter = true

  @define('SHAPE_DETAIL')
  shapeDetail: boolean = defaults.shapeDetail

  @define('TURBULENCE')
  turbulence: boolean = defaults.turbulence
}
