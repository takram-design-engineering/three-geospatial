import { useAtomValue } from 'jotai'
import { use, type ComponentPropsWithRef, type FC } from 'react'

import type { HistogramSource } from '../HistogramSource'
import type { RasterSource } from '../RasterSource'
import { Histogram } from './Histogram'
import { styledProps } from './utils'
import { Vectorscope } from './Vectorscope'
import { VideoContext } from './VideoContext'
import { Waveform } from './Waveform'

import * as styles from './VideoScopes.css'

export interface VideoScopesProps
  extends Omit<ComponentPropsWithRef<'div'>, 'children'> {
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
    <div {...styledProps(styles.root, props)}>
      <Waveform source={raster} mode='luma' />
      <Waveform source={raster} mode='rgb-parade' />
      <Vectorscope source={raster} />
      <Histogram source={histogram} />
    </div>
  )
}
