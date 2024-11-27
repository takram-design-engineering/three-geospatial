/// <reference types="vite-plugin-glsl/ext" />

import {
  Matrix4,
  NoBlending,
  PerspectiveCamera,
  ShaderMaterial,
  Uniform,
  Vector2,
  type Camera,
  type OrthographicCamera,
  type ShaderMaterialParameters,
  type Texture
} from 'three'

import {
  assertType,
  depthShader,
  packingShader,
  transformShader
} from '@takram/three-geospatial'

import fragmentShader from './shaders/ssr.frag'
import vertexShader from './shaders/ssr.vert'

export interface SSRMaterialParameters extends ShaderMaterialParameters {
  inputBuffer?: Texture | null
  geometryBuffer?: Texture | null
  depthBuffer?: Texture | null

  // Maximum ray iterations
  iterations?: number
  // Maximum binary search refinement iterations
  binarySearchIterations?: number
  // Z size in camera space of a pixel in the depth buffer = Thickness
  pixelZSize?: number
  // Number of pixels per ray step close to camera
  pixelStride?: number
  // Ray origin Z at this distance will have a pixel stride of 1
  pixelStrideZCutoff?: number
  // Maximum distance of a ray
  maxRayDistance?: number
  // Distance to screen edge that ray hits will start to fade
  screenEdgeFadeStart?: number
  // Ray direction's Z that ray hits will start to fade
  eyeFadeStart?: number
  // Ray direction's Z that ray hits will be cut
  eyeFadeEnd?: number

  jitter?: number
  roughness?: number
}

export const ssrMaterialParametersDefaults = {
  iterations: 200,
  binarySearchIterations: 4,
  pixelZSize: 0.02,
  pixelStride: 1,
  pixelStrideZCutoff: 100,
  maxRayDistance: 10,
  screenEdgeFadeStart: 0.75,
  eyeFadeStart: 0,
  eyeFadeEnd: 1,
  jitter: 0,
  roughness: 0
} satisfies SSRMaterialParameters

export class SSRMaterial extends ShaderMaterial {
  constructor(params?: SSRMaterialParameters) {
    const {
      inputBuffer = null,
      geometryBuffer = null,
      depthBuffer = null,
      iterations,
      binarySearchIterations,
      pixelZSize,
      pixelStride,
      pixelStrideZCutoff,
      maxRayDistance,
      screenEdgeFadeStart,
      eyeFadeStart,
      eyeFadeEnd,
      jitter,
      roughness,
      ...others
    } = {
      ...ssrMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'SSRMaterial',
      fragmentShader: /* glsl */ `
        ${depthShader}
        ${packingShader}
        ${transformShader}
        ${fragmentShader}
      `,
      vertexShader,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        geometryBuffer: new Uniform(geometryBuffer),
        depthBuffer: new Uniform(depthBuffer),
        projectionMatrix: new Uniform(new Matrix4()),
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        resolution: new Uniform(new Vector2()),
        texelSize: new Uniform(new Vector2()),
        cameraNear: new Uniform(0),
        cameraFar: new Uniform(1),
        iterations: new Uniform(iterations),
        binarySearchIterations: new Uniform(binarySearchIterations),
        pixelZSize: new Uniform(pixelZSize),
        pixelStride: new Uniform(pixelStride),
        pixelStrideZCutoff: new Uniform(pixelStrideZCutoff),
        maxRayDistance: new Uniform(maxRayDistance),
        screenEdgeFadeStart: new Uniform(screenEdgeFadeStart),
        eyeFadeStart: new Uniform(eyeFadeStart),
        eyeFadeEnd: new Uniform(eyeFadeEnd),
        jitter: new Uniform(jitter),
        roughness: new Uniform(roughness)
      },
      defines: {
        DEPTH_PACKING: '0',
        MAX_ITERATIONS: '1000',
        MAX_BINARY_SEARCH_ITERATIONS: '64'
      },
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others
    })
  }

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height)
    this.uniforms.texelSize.value.set(1 / width, 1 / height)
  }

  copyCameraSettings(camera?: Camera | null): void {
    if (camera == null) {
      return
    }
    assertType<PerspectiveCamera | OrthographicCamera>(camera)
    const uniforms = this.uniforms
    uniforms.cameraNear.value = camera.near
    uniforms.cameraFar.value = camera.far
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)

    if (camera instanceof PerspectiveCamera) {
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
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  get geometryBuffer(): Texture | null {
    return this.uniforms.geometryBuffer.value
  }

  set geometryBuffer(value: Texture | null) {
    this.uniforms.geometryBuffer.value = value
  }

  get depthBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set depthBuffer(value) {
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
}
