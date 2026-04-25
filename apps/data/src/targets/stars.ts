import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createInterface } from 'node:readline'
import { maxBy, meanBy, minBy } from 'lodash'
import { Color } from 'three'
import invariant from 'tiny-invariant'

import {
  clamp,
  closeTo,
  inverseLerp,
  lerp,
  radians
} from '@takram/three-geospatial'

// Reference: http://www.vendian.org/mncharity/dir3/starcolor/details.html
const bvIndexColors = [
  new Color(0x9bb2ff), // -0.40
  new Color(0x9eb5ff), // -0.35
  new Color(0xa3b9ff), // -0.30
  new Color(0xaabfff), // -0.25
  new Color(0xb2c5ff), // -0.20
  new Color(0xbbccff), // -0.15
  new Color(0xc4d2ff), // -0.10
  new Color(0xccd8ff), // -0.05
  new Color(0xd3ddff), // -0.00
  new Color(0xdae2ff), // 0.05
  new Color(0xdfe5ff), // 0.10
  new Color(0xe4e9ff), // 0.15
  new Color(0xe9ecff), // 0.20
  new Color(0xeeefff), // 0.25
  new Color(0xf3f2ff), // 0.30
  new Color(0xf8f6ff), // 0.35
  new Color(0xfef9ff), // 0.40
  new Color(0xfff9fb), // 0.45
  new Color(0xfff7f5), // 0.50
  new Color(0xfff5ef), // 0.55
  new Color(0xfff3ea), // 0.60
  new Color(0xfff1e5), // 0.65
  new Color(0xffefe0), // 0.70
  new Color(0xffeddb), // 0.75
  new Color(0xffebd6), // 0.80
  new Color(0xffe8ce), // 0.90
  new Color(0xffe6ca), // 0.95
  new Color(0xffe5c6), // 1.00
  new Color(0xffe3c3), // 1.05
  new Color(0xffe2bf), // 1.10
  new Color(0xffe0bb), // 1.15
  new Color(0xffdfb8), // 1.20
  new Color(0xffddb4), // 1.25
  new Color(0xffdbb0), // 1.30
  new Color(0xffdaad), // 1.35
  new Color(0xffd8a9), // 1.40
  new Color(0xffd6a5), // 1.45
  new Color(0xffd29c), // 1.55
  new Color(0xffd096), // 1.60
  new Color(0xffcc8f), // 1.65
  new Color(0xffc885), // 1.70
  new Color(0xffc178), // 1.75
  new Color(0xffb765), // 1.80
  new Color(0xffa94b), // 1.85
  new Color(0xff9523), // 1.90
  new Color(0xff7b00), // 1.95
  new Color(0xff5200) // 2.00
]

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
      const minIndex = -0.4
      const maxIndex = 2
      const step = 0.05
      const index =
        (clamp(bvIndex, minIndex, maxIndex) - minIndex) /
        (maxIndex - minIndex) /
        step
      const c0 = bvIndexColors[Math.floor(index)]
      const c1 = bvIndexColors[Math.ceil(index)]
      color.lerpColors(c0, c1, index - Math.floor(index))
      const { r, g, b } = color // Linear sRGB
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
