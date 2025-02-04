import { Children, cloneElement, type FC, type ReactElement } from 'react'

import { type CloudsPass } from '../CloudsPass'
import { type CloudLayerProps } from './CloudLayer'

type CloudLayerChild =
  | ReactElement<CloudLayerProps>
  | boolean
  | null
  | undefined

export type CloudLayersChildren = CloudLayerChild | readonly CloudLayerChild[]

export interface CloudLayersProps {
  pass: CloudsPass
  children?: CloudLayersChildren
}

export const CloudLayers: FC<CloudLayersProps> = ({ pass, children }) => {
  let layerIndex = 0
  return (
    children != null &&
    Children.map(children, child => {
      if (child == null || typeof child === 'boolean') {
        return null
      }
      return cloneElement(child, {
        pass,
        layerIndex: layerIndex++
      })
    })
  )
}
