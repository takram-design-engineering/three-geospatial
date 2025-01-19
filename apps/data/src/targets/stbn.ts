import { writeFile } from 'fs/promises'
import sharp from 'sharp'
import invariant from 'tiny-invariant'

const WIDTH = 128
const HEIGHT = 128
const DEPTH = 64

export default async function (): Promise<void> {
  const bytesPerLayer = WIDTH * HEIGHT * 4
  const result = new Uint8Array(bytesPerLayer * DEPTH)

  for (let depth = 0; depth < DEPTH; ++depth) {
    const vec2Image = sharp(
      `apps/data/data/STBN/stbn_vec2_2Dx1D_128x128x64_${depth}.png`
    )
    const scalarImage = sharp(
      `apps/data/data/STBN/stbn_scalar_2Dx1Dx1D_128x128x64x1_${depth}.png`
    )
    const [scalar, vec2x, vec2y] = await Promise.all([
      vec2Image.extractChannel(0).raw({ depth: 'uchar' }).toBuffer(),
      vec2Image.extractChannel(1).raw({ depth: 'uchar' }).toBuffer(),
      scalarImage.extractChannel(0).raw({ depth: 'uchar' }).toBuffer()
    ])
    invariant(vec2x.byteLength === vec2y.byteLength)
    invariant(vec2x.byteLength === scalar.byteLength)
    invariant(vec2x.byteLength * 4 === bytesPerLayer)

    for (
      let layerIndex = 0, resultIndex = bytesPerLayer * depth;
      layerIndex < scalar.byteLength;
      ++layerIndex, resultIndex += 4
    ) {
      result[resultIndex + 0] = vec2x[layerIndex]
      result[resultIndex + 1] = vec2y[layerIndex]
      result[resultIndex + 2] = scalar[layerIndex]
      result[resultIndex + 3] = 255
    }
  }
  await writeFile('packages/clouds/assets/stbn.bin', result)

  console.log('Done')
}
