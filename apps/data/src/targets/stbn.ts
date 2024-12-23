import { writeFile } from 'fs/promises'
import sharp from 'sharp'

const WIDTH = 128
const HEIGHT = 128
const DEPTH = 64

export default async function (): Promise<void> {
  const scalar = new Uint8Array(WIDTH * HEIGHT * DEPTH)
  for (let depth = 0; depth < DEPTH; ++depth) {
    const image = sharp(
      `apps/data/data/STBN/stbn_scalar_2Dx1Dx1D_128x128x64x1_${depth}.png`
    )
    const slice = new Uint8Array(
      await image.extractChannel(0).raw({ depth: 'uchar' }).toBuffer()
    )
    scalar.set(slice, depth * WIDTH * HEIGHT)
  }
  await writeFile('packages/clouds/assets/stbn_scalar.bin', scalar)

  const unitVector = new Uint8Array(WIDTH * HEIGHT * DEPTH * 4)
  for (let depth = 0; depth < DEPTH; ++depth) {
    const image = sharp(
      `apps/data/data/STBN/stbn_unitvec3_2Dx1D_128x128x64_${depth}.png`
    )
    const slice = new Uint8Array(await image.raw({ depth: 'uchar' }).toBuffer())
    unitVector.set(slice, depth * WIDTH * HEIGHT * 4)
  }
  await writeFile('packages/clouds/assets/stbn_unit_vector.bin', unitVector)

  console.log('Done')
}
