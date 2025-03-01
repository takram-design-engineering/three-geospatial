import { Loader, type Data3DTexture, type DataTexture } from 'three'
import { type Class } from 'type-fest'
import join from 'url-join'

import {
  createData3DTextureLoaderClass,
  createDataTextureLoaderClass,
  parseFloat32Array,
  type DataLoader
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
  Loader: Class<DataLoader>
  suffix?: string
}

export interface PrecomputedTextures {
  irradianceTexture: DataTexture
  scatteringTexture: Data3DTexture
  transmittanceTexture: DataTexture
}

export class PrecomputedTexturesLoader extends Loader<PrecomputedTextures> {
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
      { Loader, suffix = '' }: LoadTextureOptions
    ): void => {
      const loader = new Loader(this.manager)
      loader.setRequestHeader(this.requestHeader)
      loader.setPath(this.path)
      loader.setWithCredentials(this.withCredentials)
      loader.load(
        join(url, `${name}${suffix}.bin`),
        texture => {
          if (this.useHalfFloat) {
            texture.internalFormat = 'RGBA16F'
          }
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

    loadTexture('irradiance', {
      Loader: createDataTextureLoaderClass(parseFloat32Array, {
        width: IRRADIANCE_TEXTURE_WIDTH,
        height: IRRADIANCE_TEXTURE_HEIGHT
      })
    })
    loadTexture('scattering', {
      Loader: createData3DTextureLoaderClass(parseFloat32Array, {
        width: SCATTERING_TEXTURE_WIDTH,
        height: SCATTERING_TEXTURE_HEIGHT,
        depth: SCATTERING_TEXTURE_DEPTH
      }),
      suffix: this.useHalfFloat ? '' : '_float'
    })
    loadTexture('transmittance', {
      Loader: createDataTextureLoaderClass(parseFloat32Array, {
        width: TRANSMITTANCE_TEXTURE_WIDTH,
        height: TRANSMITTANCE_TEXTURE_HEIGHT
      })
    })
  }
}
