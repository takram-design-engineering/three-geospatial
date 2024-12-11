/// <reference types="vite-plugin-glsl/ext" />

import { VolumetricNoiseBase } from './VolumetricNoiseBase'

import fragmentShader from './shaders/detailNoise.frag'
import perlin from './shaders/perlin.glsl'
import stackableNoise from './shaders/stackableNoise.glsl'

export class DetailNoise extends VolumetricNoiseBase {
  constructor() {
    super({
      size: 32,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp int;
        ${perlin}
        ${stackableNoise}
        ${fragmentShader}
      `
    })
  }
}
