/// <reference types="vite-plugin-glsl/ext" />

import { math } from '@takram/three-geospatial/shaders'

import { RenderTexture } from './RenderTexture'

import fragmentShader from './shaders/localCoverage.frag'
import perlin from './shaders/perlin.glsl'
import tileableNoise from './shaders/tileableNoise.glsl'

export class LocalCoverage extends RenderTexture {
  constructor() {
    super({
      size: 512,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp int;
        ${math}
        ${perlin}
        ${tileableNoise}
        ${fragmentShader}
      `
    })
  }
}
