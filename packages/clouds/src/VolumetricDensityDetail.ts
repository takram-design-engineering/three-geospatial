import { math } from '@takram/three-geospatial/shaders'

import { Render3DTexture } from './Render3DTexture'

import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'
import fragmentShader from './shaders/volumetricDensityDetail.frag?raw'

export class VolumetricDensityDetail extends Render3DTexture {
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
