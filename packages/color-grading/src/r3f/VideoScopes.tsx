import styled from '@emotion/styled'
import { Splitter } from 'antd'
import {
  useCallback,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type FC,
  type ReactNode
} from 'react'

import { Histogram } from './Histogram'
import { useVideoSource } from './useVideoSource'
import { Vectorscope } from './Vectorscope'
import { Waveform } from './Waveform'

const Container = /*#__PURE__*/ styled.div`
  height: 100%;
  overflow: auto;
`

const Grid = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: 1fr 1fr auto 1fr;
  grid-template-rows: 1fr;
  row-gap: 1px;
  column-gap: 1px;
`

export interface VideoScopesProps
  extends ComponentPropsWithRef<typeof Splitter> {
  children?: ReactNode
}

export const VideoScopes: FC<VideoScopesProps> = ({ children, ...props }) => {
  const [sizes, setSizes] = useState<number[]>([])

  const onResizeRef = useRef(props.onResize)
  onResizeRef.current = props.onResize
  const handleResize = useCallback((sizes: number[]) => {
    setSizes(sizes)
    onResizeRef.current?.(sizes)
  }, [])

  const source = useVideoSource()

  return (
    <Splitter layout='vertical' {...props} onResize={handleResize}>
      <Splitter.Panel size={sizes[0]}>{children}</Splitter.Panel>
      <Splitter.Panel
        size={sizes[1]}
        min={200}
        defaultSize={300}
        collapsible
        style={{ backgroundColor: '#333' }}
      >
        {(sizes[1] == null || sizes[1] > 0) && (
          <Container>
            <Grid>
              <Waveform source={source} mode='luma' />
              <Waveform source={source} mode='rgb-parade' />
              <Vectorscope source={source} />
              <Histogram source={source} />
            </Grid>
          </Container>
        )}
      </Splitter.Panel>
    </Splitter>
  )
}
