/// <reference types="vite-plugin-glsl/ext" />

import {
  BufferAttribute,
  BufferGeometry,
  CubeCamera,
  GLSL3,
  HalfFloatType,
  LightProbe,
  Matrix4,
  Mesh,
  Scene,
  Sphere,
  Uniform,
  Vector3,
  WebGLCubeRenderTarget,
  type Camera,
  type DataTexture,
  type Group,
  type Object3D,
  type WebGLRenderer
} from 'three'
import { LightProbeGenerator } from 'three/examples/jsm/lights/LightProbeGenerator'

import { type Ellipsoid } from '@geovanni/core'

import { AtmosphereMaterialBase } from './AtmosphereMaterialBase'

import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import fragmentShader from './shaders/skyLight.frag'
import vertexShader from './shaders/skyLight.vert'

function createScreenQuadGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  const vertices = new Float32Array([-1, -1, 3, -1, -1, 3])
  geometry.boundingSphere = new Sphere()
  geometry.boundingSphere.set(new Vector3(), Infinity)
  geometry.setAttribute('position', new BufferAttribute(vertices, 2))
  return geometry
}

class SkyLightMaterial extends AtmosphereMaterialBase {
  constructor() {
    super({
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
        ${fragmentShader}
      `,
      uniforms: {
        inverseProjectionMatrix: new Uniform(new Matrix4()),
        inverseViewMatrix: new Uniform(new Matrix4())
      }
    })
  }

  override onBeforeRender(
    renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    geometry: BufferGeometry,
    object: Object3D,
    group: Group
  ): void {
    super.onBeforeRender(renderer, scene, camera, geometry, object, group)
    const uniforms = this.uniforms
    uniforms.inverseProjectionMatrix.value.copy(camera.projectionMatrixInverse)
    uniforms.inverseViewMatrix.value.copy(camera.matrixWorld)
  }
}

export interface SkyLightParameters {
  size?: number
  angularThreshold?: number

  // Derived from atmosphere material
  irradianceTexture?: DataTexture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  sunDirection?: Vector3
}

export class SkyLight extends LightProbe {
  angularThreshold: number
  sunDirection: Vector3

  private readonly renderTarget: WebGLCubeRenderTarget
  private readonly scene: Scene
  private readonly geometry: BufferGeometry
  private readonly material: SkyLightMaterial
  private readonly camera: CubeCamera
  private needsUpdate = true
  private updatePromise?: Promise<void>

  constructor({
    size = 16,
    angularThreshold = Math.PI / 100,
    sunDirection = new Vector3()
  }: SkyLightParameters = {}) {
    super()
    this.renderTarget = new WebGLCubeRenderTarget(size, {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      type: HalfFloatType
    })
    this.scene = new Scene()
    this.geometry = createScreenQuadGeometry()
    this.material = new SkyLightMaterial()
    this.scene.add(new Mesh(this.geometry, this.material))
    this.camera = new CubeCamera(0.1, 1000, this.renderTarget)

    this.angularThreshold = angularThreshold
    this.sunDirection = sunDirection
  }

  dispose(): void {
    this.material.dispose()
    this.geometry.dispose()
    this.renderTarget.dispose()
  }

  update(renderer: WebGLRenderer): void {
    if (
      !this.needsUpdate &&
      Math.acos(this.material.sunDirection.dot(this.sunDirection)) <
        this.angularThreshold &&
      this.camera.position.equals(this.position)
    ) {
      return
    }
    this.needsUpdate = false

    this.material.sunDirection.copy(this.sunDirection)
    this.camera.position.copy(this.position)
    this.camera.update(renderer, this.scene)

    if (this.updatePromise == null) {
      this.updatePromise = this.updateRenderTarget(renderer)
    } else {
      this.updatePromise = this.updatePromise.then(async () => {
        await this.updateRenderTarget(renderer)
      })
    }
  }

  private async updateRenderTarget(renderer: WebGLRenderer): Promise<void> {
    const other = await LightProbeGenerator.fromCubeRenderTarget(
      renderer,
      this.renderTarget
    )
    // @ts-expect-error Incorrect type definition of copy()
    this.copy(other)
  }

  get irradianceTexture(): DataTexture | null {
    return this.material.irradianceTexture
  }

  set irradianceTexture(value: DataTexture | null) {
    if (value !== this.irradianceTexture) {
      this.material.irradianceTexture = value
      this.needsUpdate = true
    }
  }

  get useHalfFloat(): boolean {
    return this.material.useHalfFloat
  }

  set useHalfFloat(value: boolean) {
    if (value !== this.useHalfFloat) {
      this.material.useHalfFloat = value
      this.needsUpdate = true
    }
  }

  get ellipsoid(): Ellipsoid {
    return this.material.ellipsoid
  }

  set ellipsoid(value: Ellipsoid) {
    if (value !== this.ellipsoid) {
      this.material.ellipsoid = value
      this.needsUpdate = true
    }
  }

  get osculateEllipsoid(): boolean {
    return this.material.osculateEllipsoid
  }

  set osculateEllipsoid(value: boolean) {
    if (value !== this.osculateEllipsoid) {
      this.material.osculateEllipsoid = value
      this.needsUpdate = true
    }
  }

  get photometric(): boolean {
    return this.material.photometric
  }

  set photometric(value: boolean) {
    if (value !== this.photometric) {
      this.material.photometric = value
      this.needsUpdate = true
    }
  }
}
