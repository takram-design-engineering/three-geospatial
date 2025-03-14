import { sum } from 'lodash'
import sharp, { type Metadata } from 'sharp'
import invariant from 'tiny-invariant'

const streakWidth = 16

const viewThetaCount = 5
const lightThetaCount = 10
const lightPhiCount = 9

async function readPointLight(
  viewTheta: number,
  lightTheta: number,
  lightPhi: number,
  oscillation: number
): Promise<[Buffer, Metadata]> {
  if (Math.abs(lightTheta) === 90) {
    lightPhi = 170
  }
  const directory = `apps/data/data/point_light_database/size16/dcam${`${viewTheta}`.padStart(2, '0')}`
  const file = `cv${viewTheta}_v${lightTheta}_h${lightPhi}_osc${oscillation}.png`
  const image = sharp(`${directory}/${file}`)
  return await Promise.all([
    image.extractChannel(0).raw({ depth: 'uchar' }).toBuffer(),
    image.metadata()
  ])
}

async function readEnvLight(
  viewTheta: number,
  oscillation: number
): Promise<[Buffer, Metadata]> {
  const directory = `apps/data/data/env_light_database/size16`
  const file = `cv${viewTheta}_osc${oscillation}.png`
  const image = sharp(`${directory}/${file}`)
  return await Promise.all([
    image.extractChannel(0).raw({ depth: 'uchar' }).toBuffer(),
    image.metadata()
  ])
}

export default async function (): Promise<void> {
  const streakHeights: number[] = await Promise.all(
    [...Array(viewThetaCount)].map(async (_, index) => {
      const theta = index * 20
      const [, metadata] = await readPointLight(theta, -70, 170, 0)
      invariant(metadata.height != null)
      return metadata.height
    })
  )

  const width = streakWidth * (lightThetaCount * lightPhiCount + 1)
  const height = sum(streakHeights)
  const result = new Uint8Array(width * height)

  for (let oscillation = 0; oscillation < 10; ++oscillation) {
    for (
      let viewThetaIndex = 0;
      viewThetaIndex < viewThetaCount;
      ++viewThetaIndex
    ) {
      const viewTheta = viewThetaIndex * 20
      for (
        let lightThetaIndex = 0;
        lightThetaIndex < lightThetaCount;
        ++lightThetaIndex
      ) {
        const lightTheta = -90 + lightThetaIndex * 20
        for (
          let lightPhiIndex = 0;
          lightPhiIndex < lightPhiCount;
          ++lightPhiIndex
        ) {
          const lightPhi = 10 + lightPhiIndex * 20
          const [pointLight] = await readPointLight(
            viewTheta,
            lightTheta,
            lightPhi,
            oscillation
          )

          const offsetX =
            (lightThetaIndex * lightPhiCount + lightPhiIndex) * streakWidth
          const offsetY = sum(streakHeights.slice(0, viewThetaIndex))
          for (let y = 0; y < streakHeights[viewThetaIndex]; ++y) {
            for (let x = 0; x < streakWidth; ++x) {
              result[(y + offsetY) * width + x + offsetX] =
                pointLight[y * streakWidth + x]
            }
          }
        }

        const [envLight] = await readEnvLight(viewTheta, oscillation)
        const offsetX =
          (lightThetaIndex * lightPhiCount + lightPhiCount) * streakWidth
        const offsetY = sum(streakHeights.slice(0, viewThetaIndex))
        for (let y = 0; y < streakHeights[viewThetaIndex]; ++y) {
          for (let x = 0; x < streakWidth; ++x) {
            result[(y + offsetY) * width + x + offsetX] =
              envLight[y * streakWidth + x]
          }
        }
      }
    }

    await sharp(result, {
      raw: {
        width,
        height,
        channels: 1
      }
    })
      .webp({ lossless: true })
      .toFile(`packages/weather/assets/rain${oscillation}.webp`)
  }

  console.log('Done')
}
