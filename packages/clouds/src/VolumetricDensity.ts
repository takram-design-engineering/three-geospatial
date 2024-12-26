import { resolveIncludes } from '@takram/three-geospatial'
import { math } from '@takram/three-geospatial/shaders'

import { Render3DTexture } from './Render3DTexture'

import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'
import fragmentShader from './shaders/volumetricDensity.frag?raw'

export class VolumetricDensity extends Render3DTexture {
  constructor() {
    super({
      size: 128,
      fragmentShader: resolveIncludes(fragmentShader, {
        math,
        perlin,
        tileableNoise
      })
    })
  }
}
