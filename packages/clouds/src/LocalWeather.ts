import { resolveIncludes } from '@takram/three-geospatial'
import { math } from '@takram/three-geospatial/shaders'

import { ProceduralTextureBase } from './ProceduralTexture'

import fragmentShader from './shaders/localWeather.frag?raw'
import perlin from './shaders/perlin.glsl?raw'
import tileableNoise from './shaders/tileableNoise.glsl?raw'

export class LocalWeather extends ProceduralTextureBase {
  constructor() {
    super({
      size: 512,
      fragmentShader: resolveIncludes(fragmentShader, {
        core: { math },
        perlin,
        tileableNoise
      })
    })
  }
}
