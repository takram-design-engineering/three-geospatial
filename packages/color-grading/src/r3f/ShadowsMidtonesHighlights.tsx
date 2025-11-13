import type { ComponentPropsWithRef, FC } from 'react'

import type { ShadowsMidtonesHighlightsNode } from '../ShadowsMidtonesHighlightsNode'
import { ColorWheel } from './ColorWheel'
import { useColorWheelState } from './useColorWheelState'

import * as styles from './ColorWheels.css'

export interface ShadowsMidtonesHighlightsProps
  extends ComponentPropsWithRef<'div'> {
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
    <div className={styles.root} {...props}>
      <ColorWheel name='Shadows' {...shadows} />
      <ColorWheel name='Midtones' {...midtones} />
      <ColorWheel name='Highlights' {...highlights} />
    </div>
  )
}
