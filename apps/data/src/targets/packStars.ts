import { createReadStream } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'
import { parse } from 'csv-parse'
import { transform } from 'stream-transform'
import invariant from 'tiny-invariant'

import { closeTo, parseInt16Array } from '@geovanni/core'

// See: https://paulbourke.net/miscellaneous/astronomy/
interface Record {
  rightAscension: number
  declination: number
  magnitude: number
  x: number
  y: number
  z: number
}

async function readRecords(path: string): Promise<Record[]> {
  let stringBuffer = ''
  const transformer = transform((record: Buffer, callback) => {
    const text = record.toString('utf-8')
    const index = text.lastIndexOf('\n')
    callback(
      null,
      `${stringBuffer}${text.slice(0, index)}`
        .replace(/^ +/gm, '')
        .replace(/ +/gm, ',')
    )
    stringBuffer = text.slice(index)
  })

  return await new Promise<Record[]>((resolve, reject) => {
    const records: Record[] = []
    createReadStream(path)
      .pipe(transformer)
      .pipe(parse({ delimiter: ',' }))
      .on('data', (record: string[]) => {
        records.push({
          rightAscension: +record[0],
          declination: +record[1],
          magnitude: +record[2],
          x: +record[3],
          y: +record[4],
          z: +record[5]
        })
      })
      .on('end', () => {
        resolve(records)
      })
      .on('error', reject)
  })
}

async function writeRecords(
  path: string,
  records: readonly Record[]
): Promise<Buffer> {
  const buffer = Buffer.alloc(records.length * 8)
  for (
    let recordIndex = 0, byteOffset = 0;
    recordIndex < records.length;
    ++recordIndex, byteOffset += 8
  ) {
    const record = records[recordIndex]
    buffer.writeInt16LE(Math.round(record.x * 0x7fff), byteOffset)
    buffer.writeInt16LE(Math.round(record.y * 0x7fff), byteOffset + 2)
    buffer.writeInt16LE(Math.round(record.z * 0x7fff), byteOffset + 4)
    buffer.writeInt16LE(
      Math.round((record.magnitude / 8) * 0x7fff),
      byteOffset + 6
    )
  }

  try {
    await mkdir(dirname(path), { recursive: true })
  } catch (error) {}
  await writeFile(path, buffer)
  return buffer
}

export async function main(): Promise<void> {
  const records = await readRecords('apps/data/assets/stars/catalog_text')
  const buffer = await writeRecords('apps/data/out/stars.bin', records)
  const array = parseInt16Array(buffer.buffer, true)
  const EPS = 4 / 0x7fff
  for (
    let arrayIndex = 0, recordIndex = 0;
    arrayIndex < records.length;
    arrayIndex += 4, ++recordIndex
  ) {
    const record = records[recordIndex]
    const x = array[arrayIndex] / 0x7fff
    const y = array[arrayIndex + 1] / 0x7fff
    const z = array[arrayIndex + 2] / 0x7fff
    const magnitude = (array[arrayIndex + 3] / 0x7fff) * 8
    invariant(closeTo(record.x, x, EPS))
    invariant(closeTo(record.y, y, EPS))
    invariant(closeTo(record.z, z, EPS))
    invariant(closeTo(record.magnitude, magnitude, EPS))
  }
  console.log('done')
}
