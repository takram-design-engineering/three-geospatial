import { atom } from 'jotai'
import { createContext, useMemo, type FC, type ReactNode } from 'react'
import tunnel from 'tunnel-rat'

import type { HistogramSource } from '../HistogramSource'
import type { RasterSource } from '../RasterSource'

export const VideoContext = createContext({
  r3f: tunnel(),
  rasterAtom: atom<RasterSource | null>(null),
  histogramAtom: atom<HistogramSource | null>(null)
})

export interface VideoBoundaryProps {
  children?: ReactNode
}

export const VideoBoundary: FC<VideoBoundaryProps> = ({ children }) => {
  const context = useMemo(
    () => ({
      r3f: tunnel(),
      rasterAtom: atom<RasterSource | null>(null),
      histogramAtom: atom<HistogramSource | null>(null)
    }),
    []
  )
  return <VideoContext value={context}>{children}</VideoContext>
}
