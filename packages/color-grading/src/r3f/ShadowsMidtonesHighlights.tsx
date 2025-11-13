import type { ComponentPropsWithRef, FC } from 'react'

import type { ShadowsMidtonesHighlightsNode } from '../ShadowsMidtonesHighlightsNode'
import { ColorWheel } from './ColorWheel'
import { ColorWheels } from './ColorWheels'
import { useColorWheelState } from './useColorWheelState'

export interface ShadowsMidtonesHighlightsProps
  extends ComponentPropsWithRef<typeof ColorWheels> {
  node: ShadowsMidtonesHighlightsNode
}

export const ShadowsMidtonesHighlights: FC<ShadowsMidtonesHighlightsProps> = ({
  node,
  ...props
}) => {
  const shadows = useColorWheelState(node, 'setShadows', [1, 1, 1])
  const midtones = useColorWheelState(node, 'setMidtones', [1, 1, 1])
  const highlights = useColorWheelState(node, 'setHighlights', [1, 1, 1])

  return (
    <ColorWheels {...props}>
      <ColorWheel name='Shadows' {...shadows} />
      <ColorWheel name='Midtones' {...midtones} />
      <ColorWheel name='Highlights' {...highlights} />
    </ColorWheels>
  )
}
