/// <reference types="vite-plugin-glsl/ext" />

import { VolumetricNoiseBase } from './VolumetricNoiseBase'

import perlin from './shaders/perlin.glsl'
import fragmentShader from './shaders/shapeNoise.frag'
import stackableNoise from './shaders/stackableNoise.glsl'

export class ShapeNoise extends VolumetricNoiseBase {
  constructor() {
    super({
      size: 128,
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
