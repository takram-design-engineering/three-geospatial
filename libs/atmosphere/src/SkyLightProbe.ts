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
import fragmentShader from './shaders/skyRadiance.frag'
import vertexShader from './shaders/skyRadiance.vert'

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

export interface SkyLightProbeParameters {
  frameBufferSize?: number
  angularThreshold?: number

  // Derived from atmosphere material
  irradianceTexture?: DataTexture | null
  useHalfFloat?: boolean
  ellipsoid?: Ellipsoid
  osculateEllipsoid?: boolean
  photometric?: boolean
  sunDirection?: Vector3
}

export const skyLightProbeParametersDefaults = {
  frameBufferSize: 16,
  angularThreshold: (Math.PI / 10800) * 5 // 5 arcminutes
} satisfies SkyLightProbeParameters

const vectorScratch = /*#__PURE__*/ new Vector3()

export class SkyLightProbe extends LightProbe {
  angularThreshold: number
  sunDirection: Vector3

  private readonly renderTarget: WebGLCubeRenderTarget
  private readonly scene: Scene
  private readonly geometry: BufferGeometry
  private readonly material: SkyLightMaterial
  private readonly camera: CubeCamera
  private needsUpdate = true
  private updatePromise?: Promise<void>

  constructor(params?: SkyLightProbeParameters) {
    super()

    const { frameBufferSize, angularThreshold, sunDirection } = {
      ...skyLightProbeParametersDefaults,
      ...params
    }

    this.renderTarget = new WebGLCubeRenderTarget(frameBufferSize, {
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
    this.sunDirection = sunDirection?.clone() ?? new Vector3()
  }

  dispose(): void {
    this.material.dispose()
    this.geometry.dispose()
    this.renderTarget.dispose()
  }

  update(renderer: WebGLRenderer): void {
    const angleChange = Math.acos(
      this.material.sunDirection.dot(this.sunDirection)
    )
    const worldPosition = this.getWorldPosition(vectorScratch)
    if (
      !this.needsUpdate &&
      angleChange < this.angularThreshold &&
      this.camera.position.equals(worldPosition)
    ) {
      return
    }
    this.needsUpdate = false

    this.material.sunDirection.copy(this.sunDirection)
    this.camera.position.copy(worldPosition)
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
    this.sh.copy(other.sh)
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
