/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

/// <reference types="vite-plugin-glsl/ext" />

import {
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

import fragmentShader from './shaders/clouds.frag'
import vertexShader from './shaders/clouds.vert'
import phaseFunction from './shaders/phaseFunction.glsl'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
    isOrthographicCamera?: boolean
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
  projectionMatrix: Uniform<Matrix4>
  inverseProjectionMatrix: Uniform<Matrix4>
  inverseViewMatrix: Uniform<Matrix4>
  resolution: Uniform<Vector2>
  cameraPosition: Uniform<Vector3>
  cameraNear: Uniform<number>
  cameraFar: Uniform<number>
  cameraHeight: Uniform<number>
  ellipsoidRadii: Uniform<Vector3>

  // Cloud parameters
  depthBuffer: Uniform<Texture | null>
  shapeTexture: Uniform<Texture | null>
  shapeDetailTexture: Uniform<Texture | null>
  coverageTexture: Uniform<Texture | null>
  coverageDetailTexture: Uniform<Texture | null>
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
          ${parameters}
          ${functions}
          ${depth}
          ${math}
          ${phaseFunction}
          ${fragmentShader}
        `,
        uniforms: {
          projectionMatrix: new Uniform(new Matrix4()),
          inverseProjectionMatrix: new Uniform(new Matrix4()),
          inverseViewMatrix: new Uniform(new Matrix4()),
          resolution: new Uniform(new Vector2()),
          cameraPosition: new Uniform(new Vector3()),
          cameraNear: new Uniform(0),
          cameraFar: new Uniform(0),
          cameraHeight: new Uniform(0),
          ellipsoidRadii: new Uniform(new Vector3()),

          // Cloud parameters
          depthBuffer: new Uniform(depthBuffer),
          shapeTexture: new Uniform(shape.texture),
          shapeDetailTexture: new Uniform(shapeDetail.texture),
          coverageTexture: new Uniform(null),
          coverageDetailTexture: new Uniform(null)
        } satisfies CloudsMaterialUniforms,
        defines: {
          DEPTH_PACKING: '0',
          PHASE_FUNCTION: '1'
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
    const projectionMatrix = uniforms.projectionMatrix
    const inverseProjectionMatrix = uniforms.inverseProjectionMatrix
    const inverseViewMatrix = uniforms.inverseViewMatrix
    projectionMatrix.value.copy(camera.projectionMatrix)
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

  get coverageTexture(): Texture | null {
    return this.uniforms.coverageTexture.value
  }

  set coverageTexture(value: Texture | null) {
    this.uniforms.coverageTexture.value = value
  }

  get coverageDetailTexture(): Texture | null {
    return this.uniforms.coverageDetailTexture.value
  }

  set coverageDetailTexture(value: Texture | null) {
    this.uniforms.coverageDetailTexture.value = value
  }
}
