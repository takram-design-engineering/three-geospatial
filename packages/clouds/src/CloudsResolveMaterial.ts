import { Uniform, type Texture } from 'three'

import {
  define,
  resolveIncludes,
  TemporalResolveMaterial,
  TemporalResolveMaterialParameters,
  unrollLoops
} from '@takram/three-geospatial'
import {
  catmullRomSampling,
  temporalResolve,
  turbo,
  varianceClipping
} from '@takram/three-geospatial/shaders'

import fragmentShader from './shaders/cloudsResolveMaterial.frag?raw'
import vertexShader from './shaders/cloudsResolveMaterial.vert?raw'

export interface CloudsResolveMaterialParameters
  extends TemporalResolveMaterialParameters {
  shadowLengthBuffer?: Texture | null
  shadowLengthHistoryBuffer?: Texture | null
}

interface CloudsResolveMaterialUniforms {
  [key: string]: Uniform<unknown>
  shadowLengthBuffer: Uniform<Texture | null>
  shadowLengthHistoryBuffer: Uniform<Texture | null>
}

export class CloudsResolveMaterial extends TemporalResolveMaterial<CloudsResolveMaterialUniforms> {
  constructor({
    shadowLengthBuffer = null,
    shadowLengthHistoryBuffer = null
  }: CloudsResolveMaterialParameters = {}) {
    super({
      name: 'CloudsResolveMaterial',
      vertexShader,
      fragmentShader: unrollLoops(
        resolveIncludes(fragmentShader, {
          core: {
            catmullRomSampling,
            turbo,
            varianceClipping,
            temporalResolve
          }
        })
      ),
      uniforms: {
        shadowLengthBuffer: new Uniform(shadowLengthBuffer),
        shadowLengthHistoryBuffer: new Uniform(shadowLengthHistoryBuffer)
      } satisfies CloudsResolveMaterialUniforms
    })
  }

  @define('SHADOW_LENGTH')
  shadowLength = true
}
