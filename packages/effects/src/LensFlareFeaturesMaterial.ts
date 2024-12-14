/// <reference types="vite-plugin-glsl/ext" />

import {
  NoBlending,
  Uniform,
  Vector2,
  type ShaderMaterialParameters,
  type Texture
} from 'three'

import { TypedShaderMaterial } from '@takram/three-geospatial'

import fragmentShader from './shaders/lensFlareFeatures.frag'
import vertexShader from './shaders/lensFlareFeatures.vert'

export interface LensFlareFeaturesMaterialParameters
  extends ShaderMaterialParameters {
  inputBuffer?: Texture | null
  lensColorTexture?: Texture | null
  ghostAmount?: number
  haloAmount?: number
  chromaticAberration?: number
}

export const lensFlareFeaturesMaterialParametersDefaults = {
  ghostAmount: 0.001,
  haloAmount: 0.001,
  chromaticAberration: 10
} satisfies LensFlareFeaturesMaterialParameters

export class LensFlareFeaturesMaterial extends TypedShaderMaterial<{
  inputBuffer: Uniform<Texture | null>
  texelSize: Uniform<Vector2>
  ghostAmount: Uniform<number>
  haloAmount: Uniform<number>
  chromaticAberration: Uniform<number>
}> {
  constructor(params?: LensFlareFeaturesMaterialParameters) {
    const {
      inputBuffer = null,
      ghostAmount,
      haloAmount,
      chromaticAberration,
      ...others
    } = {
      ...lensFlareFeaturesMaterialParametersDefaults,
      ...params
    }
    super({
      name: 'LensFlareFeaturesMaterial',
      fragmentShader,
      vertexShader,
      blending: NoBlending,
      toneMapped: false,
      depthWrite: false,
      depthTest: false,
      ...others,
      uniforms: {
        inputBuffer: new Uniform(inputBuffer),
        texelSize: new Uniform(new Vector2()),
        ghostAmount: new Uniform(ghostAmount),
        haloAmount: new Uniform(haloAmount),
        chromaticAberration: new Uniform(chromaticAberration),
        ...others.uniforms
      }
    })
  }

  setSize(width: number, height: number): void {
    const texelSize = this.uniforms.texelSize
    texelSize.value.x = 1 / width
    texelSize.value.y = 1 / height
  }

  get inputBuffer(): Texture | null {
    return this.uniforms.inputBuffer.value
  }

  set inputBuffer(value: Texture | null) {
    this.uniforms.inputBuffer.value = value
  }

  get ghostAmount(): number {
    return this.uniforms.ghostAmount.value
  }

  set ghostAmount(value: number) {
    this.uniforms.ghostAmount.value = value
  }

  get haloAmount(): number {
    return this.uniforms.haloAmount.value
  }

  set haloAmount(value: number) {
    this.uniforms.haloAmount.value = value
  }

  get chromaticAberration(): number {
    return this.uniforms.chromaticAberration.value
  }

  set chromaticAberration(value: number) {
    this.uniforms.chromaticAberration.value = value
  }
}
