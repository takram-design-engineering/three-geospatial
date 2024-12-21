/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/// <reference types="vite-plugin-glsl/ext" />

import {
  Color,
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  Vector3,
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
import { functions, parameters } from '@takram/three-atmosphere/shaders'
import { assertType, Geodetic } from '@takram/three-geospatial'
import { depth, math } from '@takram/three-geospatial/shaders'

import { CloudShape } from './CloudShape'
import { CloudShapeDetail } from './CloudShapeDetail'
import { STBN_TEXTURE_DEPTH, STBN_TEXTURE_SIZE } from './constants'

import fragmentShader from './shaders/clouds.frag'
import vertexShader from './shaders/clouds.vert'
import phaseFunction from './shaders/phaseFunction.glsl'
import structuredSampling from './shaders/structuredSampling.glsl'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

const vectorScratch = /*#__PURE__*/ new Vector3()
const geodeticScratch = /*#__PURE__*/ new Geodetic()

export interface CloudsMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  inputBuffer?: Texture | null
  depthBuffer?: Texture | null
}

export const cloudsMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults
} satisfies CloudsMaterialParameters

interface CloudsMaterialUniforms {
  [key: string]: Uniform
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  cameraPosition: Uniform<Vector3>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  cameraHeight: Uniform<number>

  // Cloud parameters
  depthBuffer: Uniform<Texture | null>
  shapeTexture: Uniform<Texture | null>
  shapeDetailTexture: Uniform<Texture | null>
  coverageDetailTexture: Uniform<Texture | null>
  coverage: Uniform<number>
}

export interface CloudsMaterial {
  uniforms: CloudsMaterialUniforms & AtmosphereMaterialBaseUniforms
}

export class CloudsMaterial extends AtmosphereMaterialBase {
  shape: CloudShape
  shapeDetail: CloudShapeDetail

  constructor(
    params?: CloudsMaterialParameters,
    atmosphere = AtmosphereParameters.DEFAULT
  ) {
    const { depthBuffer = null } = {
      ...cloudsMaterialParametersDefaults,
      ...params
    }

    const shape = new CloudShape()
    const shapeDetail = new CloudShapeDetail()

    super(
      {
        name: 'CloudsMaterial',
        glslVersion: GLSL3,
        vertexShader: /* glsl */ `
          precision highp float;
          precision highp sampler3D;
          ${parameters}
          ${vertexShader}
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          precision highp sampler3D;

          #include <common>
          #include <packing>

          ${parameters}
          ${functions}
          ${depth}
          ${math}
          ${phaseFunction}
          ${structuredSampling}
          ${fragmentShader}
        `,
        uniforms: {
          depthBuffer: new Uniform(depthBuffer),
          inverseProjectionMatrix: new Uniform(new Matrix4()),
          inverseViewMatrix: new Uniform(new Matrix4()),
          resolution: new Uniform(new Vector2()),
          cameraPosition: new Uniform(new Vector3()),
          cameraHeight: new Uniform(0),
          cameraNear: new Uniform(0),
          cameraFar: new Uniform(0),
          bottomRadius: new Uniform(atmosphere.bottomRadius), // TODO
          stbnScalarTexture: new Uniform(null),
          stbnVectorTexture: new Uniform(null),
          frame: new Uniform(0),

          // Cloud parameters
          shapeTexture: new Uniform(shape.texture),
          shapeDetailTexture: new Uniform(shapeDetail.texture),
          coverageDetailTexture: new Uniform(null),
          coverage: new Uniform(0.3),
          albedo: new Uniform(new Color(0.98, 0.98, 0.98)),
          useDetail: new Uniform(true),
          coverageDetailFrequency: new Uniform(new Vector2(300, 150)),
          shapeFrequency: new Uniform(0.0003),
          shapeDetailFrequency: new Uniform(0.007),

          // Raymarch to clouds
          maxIterations: new Uniform(1000),
          samplePeriod: new Uniform(100),
          maxStepScale: new Uniform(5),
          maxRayDistance: new Uniform(2e5),
          minDensity: new Uniform(1e-5),
          minTransmittance: new Uniform(1e-2)
        } satisfies CloudsMaterialUniforms,
        defines: {
          STBN_TEXTURE_SIZE: `${STBN_TEXTURE_SIZE}`,
          STBN_TEXTURE_DEPTH: `${STBN_TEXTURE_DEPTH}`,
          DEPTH_PACKING: '0',
          PHASE_FUNCTION: '2',
          MULTI_SCATTERING_OCTAVES: '8'
        }
      },
      atmosphere
    )

    this.shape = shape
    this.shapeDetail = shapeDetail
  }

  onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    this.shape.update(renderer)
    this.shapeDetail.update(renderer)
    ++this.uniforms.frame.value
  }

  copyCameraSettings(camera?: Camera | null): void {
    if (camera == null) {
      return
    }
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

    const cameraPosition = uniforms.cameraPosition
    const cameraHeight = uniforms.cameraHeight
    const position = camera.getWorldPosition(cameraPosition.value)
    try {
      cameraHeight.value = geodeticScratch.setFromECEF(position).height
    } catch (error) {
      return // Abort when the position is zero.
    }

    if (this.correctAltitude) {
      const surfacePosition = this.ellipsoid.projectOnSurface(
        position,
        vectorScratch
      )
      if (surfacePosition != null) {
        this.ellipsoid.getOsculatingSphereCenter(
          // Move the center of the atmosphere's inner sphere down to intersect
          // the viewpoint when it's located underground.
          // TODO: Too many duplicated codes.
          surfacePosition.lengthSq() < position.lengthSq()
            ? surfacePosition
            : position,
          this.atmosphere.bottomRadius,
          uniforms.ellipsoidCenter.value
        )
      }
    } else {
      uniforms.ellipsoidCenter.value.set(0, 0, 0)
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

  get coverageDetailTexture(): Texture | null {
    return this.uniforms.coverageDetailTexture.value
  }

  set coverageDetailTexture(value: Texture | null) {
    this.uniforms.coverageDetailTexture.value = value
  }

  get stbnScalarTexture(): Texture | null {
    return this.uniforms.stbnScalarTexture.value
  }

  set stbnScalarTexture(value: Texture | null) {
    this.uniforms.stbnScalarTexture.value = value
  }

  get stbnVectorTexture(): Texture | null {
    return this.uniforms.stbnVectorTexture.value
  }

  set stbnVectorTexture(value: Texture | null) {
    this.uniforms.stbnVectorTexture.value = value
  }

  get structuredSampling(): boolean {
    return this.defines.STRUCTURED_SAMPLING != null
  }

  set structuredSampling(value: boolean) {
    if (value !== this.structuredSampling) {
      if (value) {
        this.defines.STRUCTURED_SAMPLING = '1'
      } else {
        delete this.defines.STRUCTURED_SAMPLING
      }
      this.needsUpdate = true
    }
  }
}
