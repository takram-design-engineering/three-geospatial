import { useThree } from '@react-three/fiber'
import { useSetAtom } from 'jotai'
import { useContext, useLayoutEffect, type FC } from 'react'
import type { Node, Renderer } from 'three/webgpu'

import { VideoSource as VideoSourceImpl } from '../VideoSource'
import { VideoContext } from './VideoContext'

export interface VideoSourceProps {
  inputNode?: Node
}

export const VideoSource: FC<VideoSourceProps> = ({ inputNode }) => {
  const context = useContext(VideoContext)

  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const setSource = useSetAtom(context.sourceAtom)
  useLayoutEffect(() => {
    setSource(new VideoSourceImpl(renderer, inputNode))
  }, [renderer, inputNode, setSource])

  return <context.r3f.Out />
}
