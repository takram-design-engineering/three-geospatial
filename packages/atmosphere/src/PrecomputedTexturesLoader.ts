import {
  LinearFilter,
  Loader,
  type Data3DTexture,
  type DataTexture
} from 'three'
import { EXRLoader } from 'three-stdlib'
import join from 'url-join'

import {
  createData3DTextureLoader,
  createDataTextureLoader,
  EXR3DLoader,
  parseFloat16Array
} from '@takram/three-geospatial'

import {
  IRRADIANCE_TEXTURE_HEIGHT,
  IRRADIANCE_TEXTURE_WIDTH,
  SCATTERING_TEXTURE_DEPTH,
  SCATTERING_TEXTURE_HEIGHT,
  SCATTERING_TEXTURE_WIDTH,
  TRANSMITTANCE_TEXTURE_HEIGHT,
  TRANSMITTANCE_TEXTURE_WIDTH
} from './constants'

interface LoadTextureOptions {
  loader: Loader<DataTexture | Data3DTexture>
  extension: string
  useHalfFloat?: boolean
}

export interface PrecomputedTextures {
  irradianceTexture: DataTexture
  scatteringTexture: Data3DTexture
  transmittanceTexture: DataTexture
}

export class PrecomputedTexturesLoader extends Loader<PrecomputedTextures> {
  format: 'binary' | 'exr' = 'exr'

  /** @deprecated useHalfFloat is now always true */
  useHalfFloat = true

  override load(
    url: string,
    onLoad: (data: PrecomputedTextures) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const result: Record<string, DataTexture | Data3DTexture> = {}
    const loadTexture = (
      name: string,
      { loader, extension }: LoadTextureOptions
    ): void => {
      loader.setRequestHeader(this.requestHeader)
      loader.setPath(this.path)
      loader.setWithCredentials(this.withCredentials)
      loader.load(
        join(url, `${name}${extension}`),
        texture => {
          texture.minFilter = LinearFilter
          texture.magFilter = LinearFilter
          result[`${name}Texture`] = texture
          if (
            result.irradianceTexture != null &&
            result.scatteringTexture != null &&
            result.transmittanceTexture != null
          ) {
            onLoad(result as unknown as PrecomputedTextures)
          }
        },
        onProgress,
        onError
      )
    }

    if (this.format === 'exr') {
      loadTexture('irradiance', {
        loader: new EXRLoader(this.manager),
        extension: '.exr'
      })
      loadTexture('scattering', {
        loader: new EXR3DLoader(this.manager).setDepth(
          SCATTERING_TEXTURE_DEPTH
        ),
        extension: '.exr'
      })
      loadTexture('transmittance', {
        loader: new EXRLoader(this.manager),
        extension: '.exr'
      })
    } else {
      loadTexture('irradiance', {
        loader: createDataTextureLoader(parseFloat16Array, {
          width: IRRADIANCE_TEXTURE_WIDTH,
          height: IRRADIANCE_TEXTURE_HEIGHT
        }),
        extension: '.bin'
      })
      loadTexture('scattering', {
        loader: createData3DTextureLoader(parseFloat16Array, {
          width: SCATTERING_TEXTURE_WIDTH,
          height: SCATTERING_TEXTURE_HEIGHT,
          depth: SCATTERING_TEXTURE_DEPTH
        }),
        extension: '.bin'
      })
      loadTexture('transmittance', {
        loader: createDataTextureLoader(parseFloat16Array, {
          width: TRANSMITTANCE_TEXTURE_WIDTH,
          height: TRANSMITTANCE_TEXTURE_HEIGHT
        }),
        extension: '.bin'
      })
    }
  }
}
