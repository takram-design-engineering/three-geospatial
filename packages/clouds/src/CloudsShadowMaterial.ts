/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import {
  GLSL3,
  Matrix4,
  RawShaderMaterial,
  Uniform,
  Vector2,
  Vector3,
  type Camera,
  type Texture
} from 'three'

import {
  AtmosphereParameters,
  correctAtmosphereAltitude
} from '@takram/three-atmosphere'
import { Ellipsoid, resolveIncludes } from '@takram/three-geospatial'
import { depth, math } from '@takram/three-geospatial/shaders'

import { STBN_TEXTURE_DEPTH, STBN_TEXTURE_SIZE } from './constants'
import {
  createCloudLayerUniforms,
  createCloudParameterUniforms,
  type CloudLayerUniforms,
  type CloudParameterUniforms
} from './uniforms'

import clouds from './shaders/clouds.glsl?raw'
import fragmentShader from './shaders/cloudsShadow.frag?raw'
import vertexShader from './shaders/cloudsShadow.vert?raw'
import parameters from './shaders/parameters.glsl?raw'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

const vectorScratch = /*#__PURE__*/ new Vector3()

export interface CloudsShadowMaterialParameters {
  depthBuffer?: Texture | null
  ellipsoid?: Ellipsoid
  correctAltitude?: boolean
}

export const cloudsShadowMaterialParametersDefaults = {
  ellipsoid: Ellipsoid.WGS84,
  correctAltitude: true
} satisfies CloudsShadowMaterialParameters

interface CloudsShadowMaterialUniforms
  extends CloudLayerUniforms,
    CloudParameterUniforms {
  [key: string]: Uniform
  depthBuffer: Uniform<Texture | null>
  inverseProjectionMatrix: Uniform<Matrix4>
  viewMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  frame: Uniform<number>
  time: Uniform<number>
  blueNoiseTexture: Uniform<Texture | null>

  // Atmospheric parameters
  bottomRadius: Uniform<number> // TODO
  ellipsoidCenter: Uniform<Vector3>
  sunDirection: Uniform<Vector3>
}

export interface CloudsShadowMaterial {
  uniforms: CloudsShadowMaterialUniforms
}

export class CloudsShadowMaterial extends RawShaderMaterial {
  protected readonly atmosphere: AtmosphereParameters
  ellipsoid: Ellipsoid
  correctAltitude: boolean

  constructor(
    params?: CloudsShadowMaterialParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const {
      depthBuffer = null,
      ellipsoid,
      correctAltitude
    } = {
      ...cloudsShadowMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'CloudsShadowMaterial',
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: {
          depth,
          math
        },
        parameters,
        clouds
      }),
      uniforms: {
        depthBuffer: new Uniform(depthBuffer),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        viewMatrix: new Uniform(new Matrix4()),
        resolution: new Uniform(new Vector2()),
        frame: new Uniform(0),
        time: new Uniform(0),
        blueNoiseTexture: new Uniform(null),

        ...createCloudParameterUniforms(),
        ...createCloudLayerUniforms(),

        // Atmospheric parameters
        bottomRadius: new Uniform(atmosphere.bottomRadius), // TODO
        ellipsoidCenter: new Uniform(new Vector3()),
        sunDirection: new Uniform(new Vector3()),

        // Raymarch to clouds
        maxIterations: new Uniform(500),
        initialStepSize: new Uniform(500),
        maxStepSize: new Uniform(5000),
        maxRayDistance: new Uniform(4000),
        minDensity: new Uniform(1e-5),
        minTransmittance: new Uniform(1e-2)
      } satisfies CloudsShadowMaterialUniforms,
      defines: {
        STBN_TEXTURE_SIZE: `${STBN_TEXTURE_SIZE}`,
        STBN_TEXTURE_DEPTH: `${STBN_TEXTURE_DEPTH}`,
        DEPTH_PACKING: '0',
        USE_DETAIL: '1'
      }
    })

    this.atmosphere = atmosphere
    this.ellipsoid = ellipsoid
    this.correctAltitude = correctAltitude
  }

  copyCameraSettings(camera: Camera): void {
    const uniforms = this.uniforms
    const position = camera.getWorldPosition(vectorScratch)
    correctAtmosphereAltitude(
      this,
      position,
      this.atmosphere.bottomRadius,
      uniforms.ellipsoidCenter.value
    )
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
}
