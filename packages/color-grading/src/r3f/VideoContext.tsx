import { atom } from 'jotai'
import { createContext, useMemo, type FC, type ReactNode } from 'react'
import tunnel from 'tunnel-rat'

import type { VideoSource } from '../VideoSource'

export const VideoContext = createContext({
  r3f: tunnel(),
  sourceAtom: atom<VideoSource | null>(null)
})

export interface VideoBoundaryProps {
  children?: ReactNode
}

export const VideoBoundary: FC<VideoBoundaryProps> = ({ children }) => {
  const context = useMemo(
    () => ({
      r3f: tunnel(),
      sourceAtom: atom<VideoSource | null>(null)
    }),
    []
  )
  return <VideoContext value={context}>{children}</VideoContext>
}
