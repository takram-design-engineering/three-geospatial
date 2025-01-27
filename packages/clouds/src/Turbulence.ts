import { resolveIncludes } from '@takram/three-geospatial'
import { math } from '@takram/three-geospatial/shaders'

import { RenderTexture } from './RenderTexture'

import perlin from './shaders/perlin.glsl?raw'
import fragmentShader from './shaders/turbulence.frag?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'

export class Turbulence extends RenderTexture {
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
