import { resolveIncludes } from '@takram/three-geospatial'
import { math } from '@takram/three-geospatial/shaders'

import { ProceduralTextureBase } from './ProceduralTexture'

import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'
import fragmentShader from './shaders/turbulence.frag?raw'

export class Turbulence extends ProceduralTextureBase {
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
