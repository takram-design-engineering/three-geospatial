import styled from '@emotion/styled'
import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { HistogramSource } from '../HistogramSource'
import type { RasterSource } from '../RasterSource'
import { Histogram } from './Histogram'
import { Vectorscope } from './Vectorscope'
import { VideoContext } from './VideoContext'
import { Waveform } from './Waveform'

const Root = /*#__PURE__*/ styled.div`
  height: 100%;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  row-gap: 1px;
  column-gap: 1px;
`

export interface VideoScopesProps
  extends Omit<ComponentPropsWithRef<typeof Root>, 'children'> {
  raster?: RasterSource | null
  histogram?: HistogramSource | null
}

export const VideoScopes: FC<VideoScopesProps> = ({
  raster: rasterProp,
  histogram: histogramProp,
  ...props
}) => {
  const { rasterAtom, histogramAtom } = use(VideoContext)
  const raster = useAtomValue(rasterAtom) ?? rasterProp
  const histogram = useAtomValue(histogramAtom) ?? histogramProp
  return (
    <Root {...props}>
      <Waveform source={raster} mode='luma' />
      <Waveform source={raster} mode='rgb-parade' />
      <Vectorscope source={raster} />
      <Histogram source={histogram} />
    </Root>
  )
}
