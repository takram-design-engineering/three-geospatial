import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { LiftGammaGain } from './LiftGammaGain'
import { Range } from './Range'
import { ShadowsMidtonesHighlights } from './ShadowsMidtonesHighlights'
import { useColorBalanceState } from './useColorBalanceState'
import { useRangeState } from './useRangeState'
import { styledProps } from './utils'
import { VideoContext } from './VideoContext'

import * as styles from './ColorGrading.css'

export interface AdjustmentsProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node: ColorGradingNode
}

export interface ColorGradingProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node?: ColorGradingNode | null
}

export const ColorGrading: FC<ColorGradingProps> = ({
  node: nodeProp,
  ...props
}) => {
  const { colorGradingNodeAtom } = use(VideoContext)
  const node = useAtomValue(colorGradingNodeAtom) ?? nodeProp

  const { temperature, tint } = useColorBalanceState(node?.colorBalanceNode)
  const contrast = useRangeState(node, 'contrast', 1)
  const saturation = useRangeState(node, 'saturation', 1)
  const vibrance = useRangeState(node, 'vibrance', 1)

  return (
    <div {...styledProps(styles.root, props)}>
      <div className={styles.head}>
        <Range name='Temperature' min={-1} max={1} {...temperature} />
        <Range name='Tint' min={-1} max={1} {...tint} />
        <Range name='Contrast' min={0} max={2} {...contrast} />
        <Range name='Saturation' min={0} max={2} {...saturation} />
        <Range name='Vibrance' min={0} max={2} {...vibrance} />
      </div>
      <div className={styles.body}>
        <LiftGammaGain node={node?.liftGammaGainNode} />
        <ShadowsMidtonesHighlights node={node?.shadowsMidtonesHighlightsNode} />
      </div>
    </div>
  )
}
