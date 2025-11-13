import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { Adjustments } from './Adjustments'
import { LiftGammaGain } from './LiftGammaGain'
import { ShadowsMidtonesHighlights } from './ShadowsMidtonesHighlights'
import { VideoContext } from './VideoContext'

import * as styles from './ColorGrading.css'

export interface ColorGradingProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node?: ColorGradingNode | null
}

export const ColorGrading: FC<ColorGradingProps> = ({ node, ...props }) => {
  const { colorGradingNodeAtom } = use(VideoContext)
  const colorGradingNode = useAtomValue(colorGradingNodeAtom) ?? node
  return (
    <div className={styles.root} {...props}>
      {colorGradingNode != null && (
        <>
          <Adjustments node={colorGradingNode} />
          <LiftGammaGain node={colorGradingNode.liftGammaGainNode} />
          <ShadowsMidtonesHighlights
            node={colorGradingNode.shadowsMidtonesHighlightsNode}
          />
        </>
      )}
    </div>
  )
}
