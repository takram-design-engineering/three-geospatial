import type { FC } from 'react'

import type { ShadowsMidtonesHighlightsNode } from '../ShadowsMidtonesHighlightsNode'
import { ColorWheel } from './ColorWheel'
import { ColorWheels, type ColorWheelsProps } from './ColorWheels'
import { useWheelProps } from './useWheelProps'

export interface ShadowsMidtonesHighlightsProps extends ColorWheelsProps {
  node: ShadowsMidtonesHighlightsNode
}

export const ShadowsMidtonesHighlights: FC<ShadowsMidtonesHighlightsProps> = ({
  node,
  ...props
}) => {
  return (
    <ColorWheels {...props}>
      <ColorWheel
        name='Shadows'
        {...useWheelProps(node, 'setShadows', [1, 1, 1])}
      />
      <ColorWheel
        name='Midtones'
        {...useWheelProps(node, 'setMidtones', [1, 1, 1])}
      />
      <ColorWheel
        name='Highlights'
        {...useWheelProps(node, 'setHighlights', [1, 1, 1])}
      />
    </ColorWheels>
  )
}
