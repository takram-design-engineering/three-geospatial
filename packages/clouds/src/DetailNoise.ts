/// <reference types="vite-plugin-glsl/ext" />

import { math } from '@takram/three-geospatial/shaders'

import { VolumetricNoiseBase } from './VolumetricNoiseBase'

import fragmentShader from './shaders/detailNoise.frag'
import perlin from './shaders/perlin.glsl'
import tileableVolumeNoise from './shaders/tileableVolumeNoise.glsl'

export class DetailNoise extends VolumetricNoiseBase {
  constructor() {
    super({
      size: 32,
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
