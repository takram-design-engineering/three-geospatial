/// <reference types="vite-plugin-glsl/ext" />

import { math } from '@takram/three-geospatial/shaders'

import { Render3DTexture } from './Render3DTexture'

import perlin from './shaders/perlin.glsl'
import tileableNoise from './shaders/tileableNoise.glsl'
import fragmentShader from './shaders/volumetricDensity.frag'

export class VolumetricDensity extends Render3DTexture {
  constructor() {
    super({
      size: 128,
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
