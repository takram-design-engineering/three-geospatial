import { Data3DTexture, Loader, type DataTexture } from 'three'
import join from 'url-join'

import {
  Float32Data2DLoader,
  Float32Data3DLoader
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
  Loader: typeof Float32Data2DLoader | typeof Float32Data3DLoader
  width: number
  height: number
  depth?: number
  suffix?: string
}

export interface PrecomputedTextures {
  irradianceTexture: DataTexture
  scatteringTexture: Data3DTexture
  transmittanceTexture: DataTexture
}

export class PrecomputedTexturesLoader extends Loader<PrecomputedTextures> {
  useHalfFloat = false

  override load(
    url: string,
    onLoad: (data: PrecomputedTextures) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): void {
    const result: Record<string, DataTexture | Data3DTexture> = {}
    const loadTexture = (
      name: string,
      { Loader, width, height, depth, suffix = '' }: LoadTextureOptions
    ): void => {
      const loader = new Loader(this.manager)
      loader.setRequestHeader(this.requestHeader)
      loader.setPath(this.path)
      loader.setWithCredentials(this.withCredentials)
      loader.load(
        join(url, `${name}${suffix}.bin`),
        texture => {
          texture.image.width = width
          texture.image.height = height
          if (texture instanceof Data3DTexture && depth != null) {
            texture.image.depth = depth
          }
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
      Loader: Float32Data2DLoader,
      width: IRRADIANCE_TEXTURE_WIDTH,
      height: IRRADIANCE_TEXTURE_HEIGHT
    })
    loadTexture('scattering', {
      Loader: Float32Data3DLoader,
      width: SCATTERING_TEXTURE_WIDTH,
      height: SCATTERING_TEXTURE_HEIGHT,
      depth: SCATTERING_TEXTURE_DEPTH,
      suffix: this.useHalfFloat ? '' : '_float'
    })
    loadTexture('transmittance', {
      Loader: Float32Data2DLoader,
      width: TRANSMITTANCE_TEXTURE_WIDTH,
      height: TRANSMITTANCE_TEXTURE_HEIGHT
    })
  }
}
