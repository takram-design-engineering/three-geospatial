import styled from '@emotion/styled'
import { Splitter } from 'antd'
import { useState, type FC, type ReactNode } from 'react'

import type { VideoSource } from '@takram/three-color-grading'
import {
  Histogram,
  Vectorscope,
  Waveform
} from '@takram/three-color-grading/r3f'

const Content = styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr auto 1fr;
  grid-template-rows: 1fr;
  row-gap: 1px;
  column-gap: 1px;
`

export interface VideoScopesProps {
  source?: VideoSource
  children?: ReactNode
}

export const VideoScopes: FC<VideoScopesProps> = ({ source, children }) => {
  const [[size1, size2], setSizes] = useState<number[]>([])
  return (
    <Splitter layout='vertical' onResize={setSizes}>
      <Splitter.Panel size={size1}>{children}</Splitter.Panel>
      <Splitter.Panel
        size={size2}
        min={200}
        defaultSize={300}
        collapsible
        style={{ backgroundColor: '#333' }}
      >
        {(size2 == null || size2 > 0) && (
          <Content>
            <Waveform source={source} mode='luma' />
            <Waveform source={source} mode='rgb-parade' />
            <Vectorscope source={source} />
            <Histogram source={source} />
          </Content>
        )}
      </Splitter.Panel>
    </Splitter>
  )
}
