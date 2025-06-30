import {
  Data3DTexture,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Loader,
  type LoadingManager,
  type Texture,
  type WebGLRenderer
} from 'three'
import join from 'url-join'

import {
  DataTextureLoader,
  EXR3DTextureLoader,
  EXRTextureLoader,
  Float16Array,
  isFloatLinearSupported,
  parseFloat16Array,
  type AnyFloatType
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
import { type PrecomputedTextures } from './types'

interface LoaderLike<T> extends Loader<T> {
  load: (
    url: string,
    onLoad: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ) => T
}

interface LoadTextureOptions<
  T extends Texture,
  L extends LoaderLike<T> = LoaderLike<T>
> {
  loader: L
  extension: string
}

export type PrecomputedTexturesFormat = 'binary' | 'exr'

export class PrecomputedTexturesLoader extends Loader<PrecomputedTextures> {
  format: PrecomputedTexturesFormat
  type: AnyFloatType

  constructor(
    format: PrecomputedTexturesFormat = 'exr',
    type: AnyFloatType = HalfFloatType,
    manager?: LoadingManager
  ) {
    super(manager)
    this.format = format
    this.type = type
  }

  setTypeFromRenderer(renderer: WebGLRenderer): this {
    this.type = isFloatLinearSupported(renderer) ? HalfFloatType : FloatType
    return this
  }

  override load(
    url: string,
    onLoad: (data: PrecomputedTextures) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): PrecomputedTextures {
    const textures: Record<string, Texture> = {}

    const loadTexture = <T extends Texture>(
      name: 'irradiance' | 'scattering' | 'transmittance',
      { loader, extension }: LoadTextureOptions<T>
    ): T => {
      loader.setRequestHeader(this.requestHeader)
      loader.setPath(this.path)
      loader.setWithCredentials(this.withCredentials)
      return loader.load(
        join(url, `${name}${extension}`),
        texture => {
          texture.minFilter = LinearFilter
          texture.magFilter = LinearFilter

          // Using a half-float buffer introduces artifacts seemingly due to
          // insufficient precision in linear interpolation.
          texture.type = this.type
          if (this.type === FloatType) {
            texture.image.data = new Float32Array(
              new Float16Array(texture.image.data.buffer)
            )
          }

          textures[`${name}Texture`] = texture
          if (
            textures.irradianceTexture != null &&
            textures.scatteringTexture != null &&
            textures.transmittanceTexture != null
          ) {
            onLoad(textures as unknown as PrecomputedTextures)
          }
        },
        onProgress,
        onError
      )
    }

    let irradianceOptions: LoadTextureOptions<DataTexture>
    let scatteringOptions: LoadTextureOptions<Data3DTexture>
    let transmittanceOptions: LoadTextureOptions<DataTexture>

    if (this.format === 'exr') {
      irradianceOptions = {
        loader: new EXRTextureLoader(
          {
            width: IRRADIANCE_TEXTURE_WIDTH,
            height: IRRADIANCE_TEXTURE_HEIGHT
          },
          this.manager
        ),
        extension: '.exr'
      }
      scatteringOptions = {
        loader: new EXR3DTextureLoader(
          {
            width: SCATTERING_TEXTURE_WIDTH,
            height: SCATTERING_TEXTURE_HEIGHT,
            depth: SCATTERING_TEXTURE_DEPTH
          },
          this.manager
        ),
        extension: '.exr'
      }
      transmittanceOptions = {
        loader: new EXRTextureLoader(
          {
            width: TRANSMITTANCE_TEXTURE_WIDTH,
            height: TRANSMITTANCE_TEXTURE_HEIGHT
          },
          this.manager
        ),
        extension: '.exr'
      }
    } else {
      irradianceOptions = {
        loader: new DataTextureLoader(
          DataTexture,
          parseFloat16Array,
          {
            width: IRRADIANCE_TEXTURE_WIDTH,
            height: IRRADIANCE_TEXTURE_HEIGHT
          },
          this.manager
        ),
        extension: '.bin'
      }
      scatteringOptions = {
        loader: new DataTextureLoader(
          Data3DTexture,
          parseFloat16Array,
          {
            width: SCATTERING_TEXTURE_WIDTH,
            height: SCATTERING_TEXTURE_HEIGHT,
            depth: SCATTERING_TEXTURE_DEPTH
          },
          this.manager
        ),
        extension: '.bin'
      }
      transmittanceOptions = {
        loader: new DataTextureLoader(
          DataTexture,
          parseFloat16Array,
          {
            width: TRANSMITTANCE_TEXTURE_WIDTH,
            height: TRANSMITTANCE_TEXTURE_HEIGHT
          },
          this.manager
        ),
        extension: '.bin'
      }
    }

    return {
      irradianceTexture: loadTexture('irradiance', irradianceOptions),
      scatteringTexture: loadTexture('scattering', scatteringOptions),
      transmittanceTexture: loadTexture('transmittance', transmittanceOptions)
    }
  }
}
