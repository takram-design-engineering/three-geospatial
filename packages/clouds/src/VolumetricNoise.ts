import {
  Camera,
  GLSL3,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  PlaneGeometry,
  RawShaderMaterial,
  RedFormat,
  RepeatWrapping,
  Uniform,
  UnsignedByteType,
  WebGL3DRenderTarget,
  type Texture,
  type WebGLRenderer
} from 'three'

import { mathShader } from '@takram/three-geospatial'

import perlin from './shaders/perlin.glsl'
import fragmentShader from './shaders/volumetricNoise.frag'
import vertexShader from './shaders/volumetricNoise.vert'

export interface VolumetricNoiseParameters {
  worleyFrequency?: number
  worleyAmplitude?: number
  worleyLacunarity?: number
  worleyGain?: number
  worleyOctaves?: number
  invertWorley?: boolean
  perlinFrequency?: number
  perlinOctaves?: number
  modulatePerlin?: boolean
}

export class VolumetricNoise {
  private readonly material = new RawShaderMaterial({
    glslVersion: GLSL3,
    vertexShader,
    fragmentShader: /* glsl */ `
      precision highp float;
      precision highp int;
      ${perlin}
      ${mathShader}
      ${fragmentShader}
    `,
    uniforms: {
      slice: new Uniform(0),
      worleyFrequency: new Uniform(0),
      worleyAmplitude: new Uniform(0),
      worleyLacunarity: new Uniform(0),
      worleyGain: new Uniform(0),
      worleyOctaves: new Uniform(0),
      invertWorley: new Uniform(false),
      perlinFrequency: new Uniform(0),
      perlinOctaves: new Uniform(0)
    },
    depthTest: false
  })

  private readonly mesh = new Mesh(new PlaneGeometry(2, 2), this.material)
  private readonly camera = new Camera()
  private readonly renderTarget: WebGL3DRenderTarget

  readonly size = 128

  constructor(params?: VolumetricNoiseParameters) {
    Object.assign(this, {
      worleyFrequency: 8,
      worleyAmplitude: 0.5,
      worleyLacunarity: 2,
      worleyGain: 0.6,
      worleyOctaves: 4,
      invertWorley: true,
      perlinFrequency: 8,
      perlinOctaves: 6,
      modulatePerlin: true,
      ...params
    })

    this.renderTarget = new WebGL3DRenderTarget(
      this.size,
      this.size,
      this.size,
      {
        depthBuffer: false,
        stencilBuffer: false,
        type: UnsignedByteType,
        format: RedFormat
      }
    )
    const texture = this.renderTarget.texture
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.wrapR = RepeatWrapping
    texture.wrapS = RepeatWrapping
    texture.wrapT = RepeatWrapping
    texture.colorSpace = LinearSRGBColorSpace
  }

  update(renderer: WebGLRenderer): void {
    const prevRenderTarget = renderer.getRenderTarget()
    for (let face = 0; face < this.size; ++face) {
      this.material.uniforms.slice.value = face / this.size
      renderer.setRenderTarget(this.renderTarget, face)
      renderer.render(this.mesh, this.camera)
    }
    renderer.setRenderTarget(prevRenderTarget)
  }

  get texture(): Texture {
    return this.renderTarget.texture
  }

  get worleyFrequency(): number {
    return this.material.uniforms.worleyFrequency.value
  }

  set worleyFrequency(value: number) {
    this.material.uniforms.worleyFrequency.value = value
  }

  get worleyAmplitude(): number {
    return this.material.uniforms.worleyAmplitude.value
  }

  set worleyAmplitude(value: number) {
    this.material.uniforms.worleyAmplitude.value = value
  }

  get worleyLacunarity(): number {
    return this.material.uniforms.worleyLacunarity.value
  }

  set worleyLacunarity(value: number) {
    this.material.uniforms.worleyLacunarity.value = value
  }

  get worleyGain(): number {
    return this.material.uniforms.worleyGain.value
  }

  set worleyGain(value: number) {
    this.material.uniforms.worleyGain.value = value
  }

  get worleyOctaves(): number {
    return this.material.uniforms.worleyOctaves.value
  }

  set worleyOctaves(value: number) {
    this.material.uniforms.worleyOctaves.value = value
  }

  get invertWorley(): boolean {
    return this.material.uniforms.invertWorley.value
  }

  set invertWorley(value: boolean) {
    this.material.uniforms.invertWorley.value = value
  }

  get perlinFrequency(): number {
    return this.material.uniforms.perlinFrequency.value
  }

  set perlinFrequency(value: number) {
    this.material.uniforms.perlinFrequency.value = value
  }

  get perlinOctaves(): number {
    return this.material.uniforms.perlinOctaves.value
  }

  set perlinOctaves(value: number) {
    this.material.uniforms.perlinOctaves.value = value
  }

  get modulatePerlin(): boolean {
    return this.material.defines.MODULATE_PERLIN != null
  }

  set modulatePerlin(value: boolean) {
    if (value !== this.modulatePerlin) {
      if (value) {
        this.material.defines.MODULATE_PERLIN = '1'
      } else {
        delete this.material.defines.MODULATE_PERLIN
      }
      this.material.needsUpdate = true
    }
  }
}
