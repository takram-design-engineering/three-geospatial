import { useEffect, useMemo } from 'react'
import type { Node, Renderer } from 'three/webgpu'

import { VideoSource } from '../helpers/VideoSource'

export interface UseVideoAnalysisParams {
  renderer?: Renderer | null
  inputNode?: Node | null
}

export function useVideoSource({
  renderer,
  inputNode
}: UseVideoAnalysisParams = {}): VideoSource {
  const source = useMemo(
    () => new VideoSource(renderer, inputNode),
    [renderer, inputNode]
  )

  useEffect(() => {
    return () => {
      source.dispose()
    }
  }, [source])

  return source
}
