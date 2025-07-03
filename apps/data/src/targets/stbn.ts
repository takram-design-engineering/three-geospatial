import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import invariant from 'tiny-invariant'

const WIDTH = 128
const HEIGHT = 128
const DEPTH = 64

export default async function (): Promise<void> {
  const bytesPerLayer = WIDTH * HEIGHT
  const result = new Uint8Array(bytesPerLayer * DEPTH)

  for (let depth = 0; depth < DEPTH; ++depth) {
    const scalarImage = sharp(
      `apps/data/data/STBN/stbn_scalar_2Dx1Dx1D_128x128x64x1_${depth}.png`
    )
    const scalar = await scalarImage
      .extractChannel(0)
      .raw({ depth: 'uchar' })
      .toBuffer()
    const byteLength = scalar.byteLength
    invariant(byteLength === bytesPerLayer)

    for (
      let layerIndex = 0, resultIndex = bytesPerLayer * depth;
      layerIndex < byteLength;
      ++layerIndex, ++resultIndex
    ) {
      result[resultIndex] = scalar[layerIndex]
    }
  }
  await writeFile('packages/core/assets/stbn.bin', result)

  console.log('Done')
}
