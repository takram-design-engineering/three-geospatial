import {
  GLSL3,
  Matrix4,
  Uniform,
  Vector2,
  type BufferGeometry,
  type Camera,
  type Group,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer
} from 'three'

import {
  AtmosphereMaterialBase,
  atmosphereMaterialParametersBaseDefaults,
  type AtmosphereMaterialBaseParameters
} from './AtmosphereMaterialBase'

import functions from './shaders/functions.glsl'
import parameters from './shaders/parameters.glsl'
import fragmentShader from './shaders/stars.frag'
import vertexShader from './shaders/stars.vert'

declare module 'three' {
  interface Camera {
    isPerspectiveCamera?: boolean
  }
}

export interface StarsMaterialParameters
  extends AtmosphereMaterialBaseParameters {
  pointSize?: number
  radianceScale?: number
  background?: boolean
}

export const starsMaterialParametersDefaults = {
  ...atmosphereMaterialParametersBaseDefaults,
  pointSize: 1,
  radianceScale: 1,
  background: true
} satisfies StarsMaterialParameters

export class StarsMaterial extends AtmosphereMaterialBase {
  pointSize: number

  constructor(params?: StarsMaterialParameters) {
    const { pointSize, radianceScale, background, ...others } = {
      ...starsMaterialParametersDefaults,
      ...params
    }

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
      ...others,
      uniforms: {
        projectionMatrix: new Uniform(new Matrix4()),
        modelViewMatrix: new Uniform(new Matrix4()),
        viewMatrix: new Uniform(new Matrix4()),
        matrixWorld: new Uniform(new Matrix4()),
        cameraFar: new Uniform(0),
        pointSize: new Uniform(0),
        magnitudeRange: new Uniform(new Vector2(-2, 8)),
        radianceScale: new Uniform(radianceScale),
        ...others.uniforms
      },
      defines: {
        PERSPECTIVE_CAMERA: '1'
      }
    })
    this.pointSize = pointSize
    this.background = background
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
    uniforms.projectionMatrix.value.copy(camera.projectionMatrix)
    uniforms.modelViewMatrix.value.copy(camera.modelViewMatrix)
    uniforms.viewMatrix.value.copy(camera.matrixWorldInverse)
    uniforms.matrixWorld.value.copy(object.matrixWorld)
    uniforms.cameraFar.value = (camera as PerspectiveCamera).far
    uniforms.pointSize.value = this.pointSize * renderer.getPixelRatio()

    const isPerspectiveCamera = camera.isPerspectiveCamera === true
    if ((this.defines.PERSPECTIVE_CAMERA != null) !== isPerspectiveCamera) {
      if (isPerspectiveCamera) {
        this.defines.PERSPECTIVE_CAMERA = '1'
      } else {
        delete this.defines.PERSPECTIVE_CAMERA
      }
      this.needsUpdate = true
    }
  }

  get magnitudeRange(): Vector2 {
    return this.uniforms.magnitudeScale.value
  }

  get radianceScale(): number {
    return this.uniforms.radianceScale.value
  }

  set radianceScale(value: number) {
    this.uniforms.radianceScale.value = value
  }

  get background(): boolean {
    return this.defines.BACKGROUND != null
  }

  set background(value: boolean) {
    if (value !== this.background) {
      if (value) {
        this.defines.BACKGROUND = '1'
      } else {
        delete this.defines.BACKGROUND
      }
      this.needsUpdate = true
    }
  }
}
