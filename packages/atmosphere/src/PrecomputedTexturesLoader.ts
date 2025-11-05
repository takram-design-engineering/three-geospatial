import {
  Data3DTexture,
  DataTexture,
  FloatType,
  HalfFloatType,
  LinearFilter,
  Loader,
  type DataTextureImageData,
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
  reinterpretType,
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
import type { PrecomputedTextures } from './types'

interface LoaderLike<T> extends Loader<T> {
  load: (
    url: string,
    onLoad?: (data: T) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (err: unknown) => void
  ) => T
}

interface LoadTextureOptions<T> {
  key: string
  loader: LoaderLike<T>
  path: string
}

const TRANSMITTANCE_SIZE = {
  width: TRANSMITTANCE_TEXTURE_WIDTH,
  height: TRANSMITTANCE_TEXTURE_HEIGHT
}

const SCATTERING_SIZE = {
  width: SCATTERING_TEXTURE_WIDTH,
  height: SCATTERING_TEXTURE_HEIGHT,
  depth: SCATTERING_TEXTURE_DEPTH
}

const IRRADIANCE_SIZE = {
  width: IRRADIANCE_TEXTURE_WIDTH,
  height: IRRADIANCE_TEXTURE_HEIGHT
}

export type PrecomputedTexturesFormat = 'binary' | 'exr'

export interface PrecomputedTexturesLoaderOptions {
  format?: PrecomputedTexturesFormat
  type?: AnyFloatType
  combinedScattering?: boolean
  higherOrderScattering?: boolean
}

export class PrecomputedTexturesLoader extends Loader<PrecomputedTextures> {
  format: PrecomputedTexturesFormat
  type: AnyFloatType
  combinedScattering: boolean
  higherOrderScattering: boolean

  constructor(
    {
      format = 'exr',
      type = HalfFloatType,
      combinedScattering = true,
      higherOrderScattering = true
    }: PrecomputedTexturesLoaderOptions = {},
    manager?: LoadingManager
  ) {
    super(manager)
    this.format = format
    this.type = type
    this.combinedScattering = combinedScattering
    this.higherOrderScattering = higherOrderScattering
  }

  setType(renderer: WebGLRenderer): this {
    this.type = isFloatLinearSupported(renderer) ? FloatType : HalfFloatType
    return this
  }

  /** @deprecated Use setType(renderer) instead. */
  setTypeFromRenderer(renderer: WebGLRenderer): this {
    return this.setType(renderer)
  }

  override load(
    url: string,
    onLoad?: (data: PrecomputedTextures) => void,
    onProgress?: (event: ProgressEvent) => void,
    onError?: (error: unknown) => void
  ): PrecomputedTextures {
    const textures: Record<string, Texture | undefined> = {}

    const loadTexture = <T extends Texture>({
      key,
      loader,
      path
    }: LoadTextureOptions<T>): T => {
      loader.setRequestHeader(this.requestHeader)
      loader.setPath(this.path)
      loader.setWithCredentials(this.withCredentials)
      return loader.load(
        join(url, path),
        texture => {
          texture.type = this.type
          // EXR and binary data are parsed to Uint16Array, which must be
          // converted to Float32Array when FloatType is used.
          if (this.type === FloatType) {
            reinterpretType<DataTextureImageData>(texture.image)
            if (texture.image.data != null) {
              texture.image.data = new Float32Array(
                new Float16Array(texture.image.data?.buffer)
              )
            }
          }
          texture.minFilter = LinearFilter
          texture.magFilter = LinearFilter

          textures[`${key}Texture`] = texture
          if (
            textures.irradianceTexture != null &&
            textures.scatteringTexture != null &&
            textures.transmittanceTexture != null &&
            (this.combinedScattering ||
              textures.singleMieScatteringTexture != null) &&
            (!this.higherOrderScattering ||
              textures.higherOrderScatteringTexture != null)
          ) {
            onLoad?.(textures as unknown as PrecomputedTextures)
          }
        },
        onProgress,
        onError
      )
    }

    if (this.format === 'exr') {
      return {
        transmittanceTexture: loadTexture({
          key: 'transmittance',
          loader: new EXRTextureLoader(TRANSMITTANCE_SIZE, this.manager),
          path: 'transmittance.exr'
        }),
        scatteringTexture: loadTexture({
          key: 'scattering',
          loader: new EXR3DTextureLoader(SCATTERING_SIZE, this.manager),
          path: 'scattering.exr'
        }),
        irradianceTexture: loadTexture({
          key: 'irradiance',
          loader: new EXRTextureLoader(IRRADIANCE_SIZE, this.manager),
          path: 'irradiance.exr'
        }),
        singleMieScatteringTexture: !this.combinedScattering
          ? loadTexture({
              key: 'singleMieScattering',
              loader: new EXR3DTextureLoader(SCATTERING_SIZE, this.manager),
              path: 'single_mie_scattering.exr'
            })
          : undefined,
        higherOrderScatteringTexture: this.higherOrderScattering
          ? loadTexture({
              key: 'higherOrderScattering',
              loader: new EXR3DTextureLoader(SCATTERING_SIZE, this.manager),
              path: 'higher_order_scattering.exr'
            })
          : undefined
      }
    } else {
      return {
        transmittanceTexture: loadTexture({
          key: 'transmittance',
          loader: new DataTextureLoader(
            DataTexture,
            parseFloat16Array,
            TRANSMITTANCE_SIZE,
            this.manager
          ),
          path: 'transmittance.bin'
        }),
        scatteringTexture: loadTexture({
          key: 'scattering',
          loader: new DataTextureLoader(
            Data3DTexture,
            parseFloat16Array,
            SCATTERING_SIZE,
            this.manager
          ),
          path: 'scattering.bin'
        }),
        irradianceTexture: loadTexture({
          key: 'irradiance',
          loader: new DataTextureLoader(
            DataTexture,
            parseFloat16Array,
            IRRADIANCE_SIZE,
            this.manager
          ),
          path: 'irradiance.bin'
        }),
        singleMieScatteringTexture: !this.combinedScattering
          ? loadTexture({
              key: 'singleMieScattering',
              loader: new DataTextureLoader(
                Data3DTexture,
                parseFloat16Array,
                SCATTERING_SIZE,
                this.manager
              ),
              path: 'single_mie_scattering.bin'
            })
          : undefined,
        higherOrderScatteringTexture: this.higherOrderScattering
          ? loadTexture({
              key: 'higherOrderScattering',
              loader: new DataTextureLoader(
                Data3DTexture,
                parseFloat16Array,
                SCATTERING_SIZE,
                this.manager
              ),
              path: 'higher_order_scattering.bin'
            })
          : undefined
      }
    }
  }
}
