import styled from '@emotion/styled'
import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { Adjustments } from './Adjustments'
import { LiftGammaGain } from './LiftGammaGain'
import { ShadowsMidtonesHighlights } from './ShadowsMidtonesHighlights'
import { VideoContext } from './VideoContext'

const Root = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: 1fr repeat(2, 2fr);
  row-gap: 1px;
  column-gap: 1px;
`

export interface ColorGradingProps
  extends Omit<ComponentPropsWithRef<typeof Root>, 'children'> {
  node?: ColorGradingNode | null
}

export const ColorGrading: FC<ColorGradingProps> = ({ node, ...props }) => {
  const { colorGradingNodeAtom } = use(VideoContext)
  const colorGradingNode = useAtomValue(colorGradingNodeAtom) ?? node
  return (
    <Root {...props}>
      {colorGradingNode != null && (
        <>
          <Adjustments node={colorGradingNode} />
          <LiftGammaGain node={colorGradingNode.liftGammaGainNode} />
          <ShadowsMidtonesHighlights
            node={colorGradingNode.shadowsMidtonesHighlightsNode}
          />
        </>
      )}
    </Root>
  )
}
