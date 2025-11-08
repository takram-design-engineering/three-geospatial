import styled from '@emotion/styled'
import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { ColorGradingNode } from '../ColorGradingNode'
import { GlobalControls } from './GlobalControls'
import { LiftGammaGain } from './LiftGammaGain'
import { ShadowsMidtonesHighlights } from './ShadowsMidtonesHighlights'
import { VideoContext } from './VideoContext'

const Root = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: auto 1fr 1fr;
  row-gap: 1px;
  column-gap: 1px;
`

export interface ColorGradingControlsProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
  node?: ColorGradingNode | null
}

export const ColorGradingControls: FC<ColorGradingControlsProps> = ({
  node,
  ...props
}) => {
  const { colorGradingNodeAtom } = use(VideoContext)
  const colorGradingNode = useAtomValue(colorGradingNodeAtom) ?? node
  return (
    <Root {...props}>
      {colorGradingNode != null && (
        <>
          <GlobalControls />
          <LiftGammaGain node={colorGradingNode.liftGammaGainNode} />
          <ShadowsMidtonesHighlights
            node={colorGradingNode.shadowsMidtonesHighlightsNode}
          />
        </>
      )}
    </Root>
  )
}
