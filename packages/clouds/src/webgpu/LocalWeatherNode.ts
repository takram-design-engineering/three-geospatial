import { Vector2 } from 'three'
import { float, Loop, smoothstep, vec3, vec4 } from 'three/tsl'
import type { Node, NodeBuilder } from 'three/webgpu'

import { FnLayout, type NodeObject } from '@takram/three-geospatial/webgpu'

import { ProceduralTextureNode } from './ProceduralTextureNode'
import { perlinNoise, worleyNoise } from './tileableNoise'

const worleyFbm = /*#__PURE__*/ FnLayout({
  name: 'worleyFbm',
  type: 'float',
  inputs: [
    { name: 'point', type: 'vec3' },
    { name: 'frequency', type: 'float' },
    { name: 'amplitude', type: 'float' },
    { name: 'lacunarity', type: 'float' },
    { name: 'gain', type: 'float' },
    { name: 'octaveCount', type: 'int' }
  ]
})(([point, frequency, amplitude, lacunarity, gain, octaveCount]) => {
  const amplitudeVar = amplitude.toVar()
  const frequencyVar = frequency.toVar()
  const noise = float(0).toVar()
  Loop({ start: 0, end: octaveCount }, () => {
    noise.addAssign(
      amplitudeVar.mul(worleyNoise(point, frequencyVar).oneMinus())
    )
    frequencyVar.mulAssign(lacunarity)
    amplitudeVar.mulAssign(gain)
  })
  return noise
})

export class LocalWeatherNode extends ProceduralTextureNode {
  override get type(): string {
    return 'LocalWeatherNode'
  }

  constructor(size = new Vector2().setScalar(512)) {
    super(size)
  }

  protected override setupOutputNode(
    uv: NodeObject<'vec2'>,
    builder: NodeBuilder
  ): Node {
    const output = vec4().toVar()

    // Mid clouds
    {
      let worley = worleyFbm(
        uv.add(vec3(0.5)),
        8.0, // frequency
        0.4, // amplitude
        2.0, // lacunarity
        0.95, // gain
        4 // octaveCount
      )
      worley = smoothstep(1.0, 1.4, worley)
      output.g.assign(worley)
    }

    // Low clouds
    {
      let worley = worleyFbm(
        uv,
        16.0, // frequency
        0.4, // amplitude
        2.0, // lacunarity
        0.95, // gain
        4 // octaveCount
      )
      worley = smoothstep(0.8, 1.4, worley)
      output.r.assign(worley.sub(output.g).saturate())
    }

    // High clouds
    {
      let perlin = perlinNoise(
        uv,
        vec3(6.0, 12.0, 1.0), // frequency
        8 // octaveCount
      )
      perlin = smoothstep(-0.5, 0.5, perlin)
      output.b.assign(perlin)
    }

    // Extra
    {
      let perlin = perlinNoise(
        uv.add(vec3(-19.1, 33.4, 47.2)),
        32.0, // frequency
        4 // octaveCount
      )
      perlin = smoothstep(-0.5, 0.5, perlin)
      output.a.assign(perlin)
    }

    return output
  }
}
