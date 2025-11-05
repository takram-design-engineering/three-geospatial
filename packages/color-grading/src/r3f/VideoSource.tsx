import { useSetAtom } from 'jotai'
import { useContext, useLayoutEffect, type FC } from 'react'
import type { TextureNode } from 'three/webgpu'

import { HistogramSource } from '../HistogramSource'
import { RasterSource } from '../RasterSource'
import { VideoContext } from './VideoContext'

export interface VideoSourceProps {
  inputNode?: TextureNode
}

export const VideoSource: FC<VideoSourceProps> = ({ inputNode }) => {
  const context = useContext(VideoContext)

  const setRaster = useSetAtom(context.rasterAtom)
  const setHistogram = useSetAtom(context.histogramAtom)
  useLayoutEffect(() => {
    setRaster(new RasterSource(inputNode))
    setHistogram(new HistogramSource(inputNode))
  }, [inputNode, setRaster, setHistogram])

  return <context.r3f.Out />
}
