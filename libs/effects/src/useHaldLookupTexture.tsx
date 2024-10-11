import { useLoader } from '@react-three/fiber'
import { LookupTexture, RawImageData } from 'postprocessing'
import { useMemo } from 'react'
import { TextureLoader } from 'three'

// TODO: Make axes configurable.
export function useHaldLookupTexture(url: string): LookupTexture {
  const texture = useLoader(TextureLoader, url)
  return useMemo(() => {
    const { image } = texture
    const { width, height } = image
    if (width !== height) {
      throw new Error('Hald CLUT image must be square.')
    }
    const size = Math.cbrt(width * height)
    if (size % 1 !== 0) {
      throw new Error('Hald CLUT image must be cubic.')
    }
    const { data } = RawImageData.from(image)
    const lut = new LookupTexture(data, size)
    lut.name = texture.name
    lut.type = texture.type
    return lut
  }, [texture])
}
