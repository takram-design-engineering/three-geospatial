import { LookupTexture, RawImageData } from 'postprocessing'
import type { Texture } from 'three'

import { reinterpretType } from '@takram/three-geospatial'

export function createHaldLookupTexture(texture: Texture): LookupTexture {
  reinterpretType<ImageData>(texture.image)
  const { width, height } = texture.image
  if (width !== height) {
    throw new Error('Hald CLUT image must be square.')
  }
  const size = Math.cbrt(width * height)
  if (size % 1 !== 0) {
    throw new Error('Hald CLUT image must be cubic.')
  }
  const { data } = RawImageData.from(texture.image)
  const lut = new LookupTexture(data, size)
  lut.name = texture.name
  lut.type = texture.type
  texture.colorSpace = lut.colorSpace
  return lut
}
