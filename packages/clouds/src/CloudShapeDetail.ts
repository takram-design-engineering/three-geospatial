/// <reference types="vite-plugin-glsl/ext" />

import { math } from '@takram/three-geospatial/shaders'

import { Render3DTexture } from './Render3DTexture'

import fragmentShader from './shaders/cloudShapeDetail.frag'
import perlin from './shaders/perlin.glsl'
import tileableNoise from './shaders/tileableNoise.glsl'

export class CloudShapeDetail extends Render3DTexture {
  constructor() {
    super({
      size: 32,
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
