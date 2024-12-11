/// <reference types="vite-plugin-glsl/ext" />

import { math } from '@takram/three-geospatial/shaders'

import { VolumetricNoiseBase } from './VolumetricNoiseBase'

import perlin from './shaders/perlin.glsl'
import fragmentShader from './shaders/shapeNoise.frag'
import tileableVolumeNoise from './shaders/tileableVolumeNoise.glsl'

export class ShapeNoise extends VolumetricNoiseBase {
  constructor() {
    super({
      size: 128,
      fragmentShader: /* glsl */ `
        precision highp float;
        precision highp int;
        ${math}
        ${perlin}
        ${tileableVolumeNoise}
        ${fragmentShader}
      `
    })
  }
}
