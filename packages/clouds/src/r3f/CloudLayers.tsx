import {
  createContext,
  useLayoutEffect,
  useState,
  type FC,
  type ReactNode
} from 'react'

import { createDefaultCloudLayers, type CloudLayer } from '../cloudLayer'

export interface CloudLayersContextValue {
  layers: CloudLayer[]
  indexPool: Array<0 | 1 | 2 | 3>
}

export const CloudLayersContext = createContext<CloudLayersContextValue>({
  layers: [],
  indexPool: []
})

export interface CloudLayersProps {
  layers: CloudLayer[]
  disableDefault?: boolean
  children?: ReactNode
}

export const CloudLayers: FC<CloudLayersProps> = ({
  layers,
  disableDefault = false,
  children
}) => {
  const [context, setContext] = useState<CloudLayersContextValue>()

  useLayoutEffect(() => {
    if (disableDefault) {
      Object.assign(layers, [{}, {}, {}, {}])
    } else {
      Object.assign(layers, createDefaultCloudLayers())
    }
    setContext({
      layers,
      indexPool: [0, 1, 2, 3]
    })
  }, [layers, disableDefault])

  return (
    context != null && (
      <CloudLayersContext.Provider value={context}>
        {children}
      </CloudLayersContext.Provider>
    )
  )
}
