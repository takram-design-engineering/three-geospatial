import { type Meta } from '@storybook/react'

import _LocalWeather from './BuildingBlocks-LocalWeather'
import _Shape from './BuildingBlocks-Shape'
import _ShapeDetail from './BuildingBlocks-ShapeDetail'
import _Turbulence from './BuildingBlocks-Turbulence'
import _VolumetricShape from './BuildingBlocks-VolumetricShape'

export default {
  title: 'clouds (WIP)/Building Blocks',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const LocalWeather = _LocalWeather
export const Shape = _Shape
export const ShapeDetail = _ShapeDetail
export const Turbulence = _Turbulence
export const VolumetricShape = _VolumetricShape
