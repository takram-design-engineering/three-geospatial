import { createContext, useMemo, type FC, type ReactNode } from 'react'

import { type CloudLayer } from '../cloudLayer'
import { type CloudsEffect } from '../CloudsEffect'

export interface CloudLayersContextValue {
  layers: CloudLayer[]
  indexPool: number[]
}

export const CloudLayersContext = createContext<CloudLayersContextValue>({
  layers: [],
  indexPool: []
})

export interface CloudLayersProps {
  effect: CloudsEffect
  children?: ReactNode
}

export const CloudLayers: FC<CloudLayersProps> = ({ effect, children }) => {
  const context = useMemo(
    () => ({ layers: effect.cloudLayers, indexPool: [0, 1, 2, 3] }),
    [effect]
  )
  return (
    <CloudLayersContext.Provider value={context}>
      {children}
    </CloudLayersContext.Provider>
  )
}
