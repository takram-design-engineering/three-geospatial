import { useThree } from '@react-three/fiber'
import { atom, useSetAtom } from 'jotai'
import { createContext, useContext, useLayoutEffect, type FC } from 'react'
import type { Node, Renderer } from 'three/webgpu'
import tunnel from 'tunnel-rat'

import { VideoSource as VideoSourceImpl } from '../VideoSource'

export const VideoContext = createContext({
  r3f: tunnel(),
  sourceAtom: atom<VideoSourceImpl | null>(null)
})

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
