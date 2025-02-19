import {
  createContext,
  useLayoutEffect,
  useState,
  type FC,
  type ReactNode
} from 'react'

import { CloudLayer } from '../CloudLayer'
import { CloudLayers as CloudLayersImpl } from '../CloudLayers'

export interface CloudLayersContextValue {
  layers: CloudLayersImpl
  indexPool: number[]
  disableDefault: boolean
}

export const CloudLayersContext =
  /*#__PURE__*/ createContext<CloudLayersContextValue | null>(null)

export interface CloudLayersProps {
  layers: CloudLayersImpl
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
    layers.set(
      disableDefault
        ? Array(4).fill(CloudLayer.DEFAULT)
        : CloudLayersImpl.DEFAULT
    )
    setContext({
      layers,
      indexPool: [0, 1, 2, 3],
      disableDefault
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
