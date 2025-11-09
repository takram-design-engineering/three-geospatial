import { atom } from 'jotai'
import { createContext, useMemo, type FC, type ReactNode } from 'react'
import tunnel from 'tunnel-rat'

import type { ColorGradingNode } from '../ColorGradingNode'
import type { HistogramSource } from '../HistogramSource'
import type { RasterSource } from '../RasterSource'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createVideoContextValue() {
  return {
    r3f: tunnel(),
    rasterAtom: atom<RasterSource | null>(null),
    histogramAtom: atom<HistogramSource | null>(null),
    colorGradingNodeAtom: atom<ColorGradingNode | null>(null)
  }
}

export const VideoContext = createContext(createVideoContextValue())

export interface VideoBoundaryProps {
  children?: ReactNode
}

export const VideoBoundary: FC<VideoBoundaryProps> = ({ children }) => {
  const context = useMemo(() => createVideoContextValue(), [])
  return <VideoContext value={context}>{children}</VideoContext>
}
