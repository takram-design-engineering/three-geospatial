import { useSetAtom } from 'jotai'
import { useContext, useLayoutEffect, type FC } from 'react'
import type { TextureNode } from 'three/webgpu'

import type { ColorGradingNode } from '../ColorGradingNode'
import { HistogramSource } from '../HistogramSource'
import { RasterSource } from '../RasterSource'
import { VideoContext } from './VideoContext'

export interface VideoSourceProps {
  inputNode?: TextureNode
  colorGradingNode?: ColorGradingNode
}

export const VideoSource: FC<VideoSourceProps> = ({
  inputNode,
  colorGradingNode
}) => {
  const context = useContext(VideoContext)

  const setRaster = useSetAtom(context.rasterAtom)
  const setHistogram = useSetAtom(context.histogramAtom)
  useLayoutEffect(() => {
    setRaster(new RasterSource(inputNode))
    setHistogram(new HistogramSource(inputNode))
  }, [inputNode, setRaster, setHistogram])

  const setColorGradingNode = useSetAtom(context.colorGradingNodeAtom)
  setColorGradingNode(colorGradingNode ?? null)

  return <context.r3f.Out />
}
