import { readFile, writeFile } from 'node:fs/promises'

import { Float16Array, parseFloat32Array } from '@takram/three-geospatial'

export default async function (): Promise<void> {
  const irradiance = new Float16Array([
    ...parseFloat32Array(
      (await readFile('apps/data/data/irradiance.bin')).buffer
    )
  ])
  const scattering = new Float16Array([
    ...parseFloat32Array(
      (await readFile('apps/data/data/scattering.bin')).buffer
    )
  ])
  const transmittance = new Float16Array([
    ...parseFloat32Array(
      (await readFile('apps/data/data/transmittance.bin')).buffer
    )
  ])

  await writeFile(
    'packages/atmosphere/assets/irradiance.bin',
    Buffer.from(irradiance.buffer)
  )
  await writeFile(
    'packages/atmosphere/assets/scattering.bin',
    Buffer.from(scattering.buffer)
  )
  await writeFile(
    'packages/atmosphere/assets/transmittance.bin',
    Buffer.from(transmittance.buffer)
  )

  console.log('Done')
}
