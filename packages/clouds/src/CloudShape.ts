import { resolveIncludes } from '@takram/three-geospatial'
import { math } from '@takram/three-geospatial/shaders'

import { Render3DTexture } from './Render3DTexture'

import fragmentShader from './shaders/cloudShape.frag?raw'
import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'

export class CloudShape extends Render3DTexture {
  constructor() {
    super({
      size: 128,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: { math },
        perlin,
        tileableNoise
      })
    })
  }
}
