import type { ComponentPropsWithRef, FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { InputRange } from './Range'
import { useColorBalanceState } from './useColorBalanceState'
import { useRangeState } from './useRangeState'
import { styledProps } from './utils'

import * as styles from './Adjustments.css'

export interface AdjustmentsProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node: ColorGradingNode
}

export const Adjustments: FC<AdjustmentsProps> = ({ node, ...props }) => {
  const { temperature, tint } = useColorBalanceState(node.colorBalanceNode)
  const contrast = useRangeState(node, 'contrast', 1)
  const saturation = useRangeState(node, 'saturation', 1)
  const vibrance = useRangeState(node, 'vibrance', 1)

  return (
    <div {...styledProps(styles.root, props)}>
      <InputRange name='Temperature' min={-1} max={1} {...temperature} />
      <InputRange name='Tint' min={-1} max={1} {...tint} />
      <InputRange name='Contrast' min={0} max={2} {...contrast} />
      <InputRange name='Saturation' min={0} max={2} {...saturation} />
      <InputRange name='Vibrance' min={0} max={2} {...vibrance} />
    </div>
  )
}
