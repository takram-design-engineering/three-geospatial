import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { maxBy, meanBy, minBy } from 'lodash'
import { Color } from 'three'
import invariant from 'tiny-invariant'

import { convertBVIndexToLinearSRGBChromaticity } from '@takram/three-atmosphere'
import { closeTo, inverseLerp, lerp, radians } from '@takram/three-geospatial'

function readRightAscension(input: string): number | undefined {
  const hours = parseInt(input.slice(75, 77), 10)
  const minutes = parseInt(input.slice(77, 79), 10)
  const seconds = parseFloat(input.slice(79, 83))
  return !isNaN(hours) && !isNaN(minutes) && !isNaN(seconds)
    ? hours * 15 + minutes / 4 + seconds / 240
    : undefined
}

function readDeclination(input: string): number | undefined {
  const degrees = parseInt(input.slice(83, 86), 10)
  const minutes = parseInt(input.slice(86, 88), 10)
  const seconds = parseInt(input.slice(88, 90), 10)
  return !isNaN(degrees) && !isNaN(minutes) && !isNaN(seconds)
    ? Math.sign(degrees) * Math.abs(degrees) + minutes / 60 + seconds / 3600
    : undefined
}

function readMagnitude(input: string): number | undefined {
  const value = parseFloat(input.slice(102, 107))
  return !isNaN(value) ? value : undefined
}

function readBVIndex(input: string): number | undefined {
  const value = parseFloat(input.slice(109, 114))
  return !isNaN(value) ? value : 0.6
}

interface Record {
  x: number
  y: number
  z: number
  magnitude: number
  r: number
  g: number
  b: number
}

async function readRecords(path: string): Promise<Record[]> {
  interface IntermediateRecord {
    x: number
    y: number
    z: number
    magnitude: number
    bvIndex?: number
  }

  const records = await new Promise<IntermediateRecord[]>((resolve, reject) => {
    const records: IntermediateRecord[] = []
    const readline = createInterface(createReadStream(path))
    readline.on('line', input => {
      const rightAscension = readRightAscension(input)
      const declination = readDeclination(input)
      const magnitude = readMagnitude(input)
      const bvIndex = readBVIndex(input)
      if (rightAscension == null || declination == null || magnitude == null) {
        return
      }
      // Convert to ECI direction, epoch J2000.
      const alpha = radians(rightAscension)
      const delta = radians(declination)
      const x = Math.cos(delta) * Math.cos(alpha)
      const y = Math.cos(delta) * Math.sin(alpha)
      const z = Math.sin(delta)
      records.push({ x, y, z, magnitude, bvIndex })
    })
    readline.on('error', reject)
    readline.on('close', () => {
      resolve(records)
    })
  })

  const bvIndexFallback = meanBy(
    records.filter(({ bvIndex }) => bvIndex != null),
    'bvIndex'
  )
  const color = new Color()
  return records
    .map(({ bvIndex = bvIndexFallback, ...others }) => {
      const { r, g, b } = convertBVIndexToLinearSRGBChromaticity(bvIndex, color)
      return { ...others, r, g, b }
    })
    .sort((a, b) => a.magnitude - b.magnitude)
}

async function writeRecords(
  path: string,
  records: readonly Record[]
): Promise<{
  data: Buffer
  minMagnitude: number
  maxMagnitude: number
}> {
  const minMagnitude = Math.floor(minBy(records, 'magnitude')?.magnitude ?? 0)
  const maxMagnitude = Math.ceil(maxBy(records, 'magnitude')?.magnitude ?? 0)
  const bytesPerRecord = 10
  const data = Buffer.alloc(records.length * bytesPerRecord)
  for (
    let recordIndex = 0, byteOffset = 0;
    recordIndex < records.length;
    ++recordIndex, byteOffset += bytesPerRecord
  ) {
    const record = records[recordIndex]
    data.writeInt16LE(Math.round(record.x * 0x7fff), byteOffset)
    data.writeInt16LE(Math.round(record.y * 0x7fff), byteOffset + 2)
    data.writeInt16LE(Math.round(record.z * 0x7fff), byteOffset + 4)
    data.writeUint8(
      Math.round(
        inverseLerp(minMagnitude, maxMagnitude, record.magnitude) * 0xff
      ),
      byteOffset + 6
    )
    data.writeUint8(Math.round(record.r * 0xff), byteOffset + 7)
    data.writeUint8(Math.round(record.g * 0xff), byteOffset + 8)
    data.writeUint8(Math.round(record.b * 0xff), byteOffset + 9)
  }
  try {
    await mkdir(dirname(path), { recursive: true })
  } catch (error: unknown) {}
  await writeFile(path, data)

  return {
    data,
    minMagnitude,
    maxMagnitude
  }
}

export default async function (): Promise<void> {
  const records = await readRecords('apps/data/data/ybsc5')
  const { data, minMagnitude, maxMagnitude } = await writeRecords(
    'packages/atmosphere/assets/stars.bin',
    records
  )
  console.log(`minMagnitude = ${minMagnitude}`)
  console.log(`maxMagnitude = ${maxMagnitude}`)

  const dataView = new DataView(data.buffer)
  for (
    let byteOffset = 0, recordIndex = 0;
    byteOffset < records.length;
    byteOffset += 10, ++recordIndex
  ) {
    const record = records[recordIndex]
    const x = dataView.getInt16(byteOffset, true) / 0x7fff
    const y = dataView.getInt16(byteOffset + 2, true) / 0x7fff
    const z = dataView.getInt16(byteOffset + 4, true) / 0x7fff
    const magnitude = lerp(
      minMagnitude,
      maxMagnitude,
      dataView.getUint8(byteOffset + 6) / 0xff
    )
    const r = dataView.getUint8(byteOffset + 7) / 0xff
    const g = dataView.getUint8(byteOffset + 8) / 0xff
    const b = dataView.getUint8(byteOffset + 9) / 0xff
    invariant(closeTo(record.x, x, 0.001))
    invariant(closeTo(record.y, y, 0.001))
    invariant(closeTo(record.z, z, 0.001))
    invariant(closeTo(record.magnitude, magnitude, 0.1))
    invariant(closeTo(record.r, r, 0.01))
    invariant(closeTo(record.g, g, 0.01))
    invariant(closeTo(record.b, b, 0.01))
  }

  console.log('Done')
}
