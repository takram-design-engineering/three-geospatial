import { math } from '@takram/three-geospatial/shaders'

import { RenderTexture } from './RenderTexture'

import fragmentShader from './shaders/localWeather.frag?raw'
import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'

export class LocalWeather extends RenderTexture {
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
