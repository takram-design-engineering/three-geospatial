import styled from '@emotion/styled'
import type { ComponentPropsWithRef, FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { Range } from './Range'
import { useColorBalanceState } from './useColorBalanceState'
import { useRangeState } from './useRangeState'

const Root = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: auto 40px 1fr auto;
  align-items: center;
  align-content: start;
  column-gap: 8px;
  row-gap: 16px;
  padding: 8px 16px;
  background-color: #222;
`

export interface AdjustmentsProps
  extends Omit<ComponentPropsWithRef<typeof Root>, 'children'> {
  node: ColorGradingNode
}

export const Adjustments: FC<AdjustmentsProps> = ({ node, ...props }) => {
  const { temperature, tint } = useColorBalanceState(node.colorBalanceNode)
  const contrast = useRangeState(node, 'contrast', 1)
  const saturation = useRangeState(node, 'saturation', 1)
  const vibrance = useRangeState(node, 'vibrance', 1)

  return (
    <Root {...props}>
      <Range name='Temperature' min={-1} max={1} {...temperature} />
      <Range name='Tint' min={-1} max={1} {...tint} />
      <Range name='Contrast' min={0} max={2} {...contrast} />
      <Range name='Saturation' min={0} max={2} {...saturation} />
      <Range name='Vibrance' min={0} max={2} {...vibrance} />
    </Root>
  )
}
