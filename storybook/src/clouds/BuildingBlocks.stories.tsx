import { type Meta } from '@storybook/react'

import _LocalWeather from './Clouds-LocalWeather'
import _Shape from './Clouds-Shape'
import _ShapeDetail from './Clouds-ShapeDetail'
import _VolumetricShape from './Clouds-VolumetricShape'

export default {
  title: 'clouds (WIP)/Building Blocks',
  parameters: {
    layout: 'fullscreen'
  }
} satisfies Meta

export const LocalWeather = _LocalWeather
export const Shape = _Shape
export const ShapeDetail = _ShapeDetail
export const VolumetricShape = _VolumetricShape
