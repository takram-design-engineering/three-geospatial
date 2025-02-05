import { Children, type FC, type ReactElement } from 'react'

import { type CloudLayer } from '../cloudLayer'
import { type CloudsEffect } from '../CloudsEffect'
import { type CloudLayerProps } from './CloudLayer'

type CloudLayerChild =
  | ReactElement<CloudLayerProps>
  | boolean
  | null
  | undefined

export type CloudLayersChildren = CloudLayerChild | readonly CloudLayerChild[]

interface CloudLayerImplProps extends CloudLayerProps {
  layers: CloudLayer[]
  layerIndex: number
}

const CloudLayerImpl: FC<CloudLayerImplProps> = ({
  layers,
  layerIndex,
  ...props
}) => {
  layers[layerIndex] = Object.assign(layers[layerIndex] ?? {}, props)
  if (props.densityProfile != null) {
    layers[layerIndex].densityProfile = Object.assign(
      layers[layerIndex].densityProfile ?? {},
      props.densityProfile
    )
  }
  return null
}

export interface CloudLayersProps {
  effect: CloudsEffect
  children?: CloudLayersChildren
}

export const CloudLayers: FC<CloudLayersProps> = ({ effect, children }) => {
  let layerIndex = 0
  return (
    children != null &&
    Children.map(children, child => {
      if (child == null || typeof child === 'boolean') {
        return null
      }
      return (
        <CloudLayerImpl
          key={layerIndex}
          {...child.props}
          layers={effect.cloudLayers}
          layerIndex={layerIndex++}
        />
      )
    })
  )
}
