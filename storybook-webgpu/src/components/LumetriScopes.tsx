import styled from '@emotion/styled'
import type { FC } from 'react'

import type { VideoSource } from '@takram/three-color-grading'
import {
  Histogram,
  Vectorscope,
  Waveform
} from '@takram/three-color-grading/r3f'

const Root = styled.div`
  display: flex;
  flex-direction: row;
`

export interface LumetriScopesProps {
  source?: VideoSource
}

export const LumetriScopes: FC<LumetriScopesProps> = ({ source }) => (
  <Root>
    <Waveform source={source} />
    <Vectorscope source={source} />
    <Histogram source={source} />
  </Root>
)
