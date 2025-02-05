import { Children, type FC, type ReactElement } from 'react'

import { type CloudsEffect } from '../CloudsEffect'
import { type CloudLayerProps } from './CloudLayer'

type CloudLayerChild =
  | ReactElement<CloudLayerProps>
  | boolean
  | null
  | undefined

export type CloudLayersChildren = CloudLayerChild | readonly CloudLayerChild[]

interface CloudLayerImplProps extends CloudLayerProps {
  effect: CloudsEffect
  layerIndex: number
}

const CloudLayerImpl: FC<CloudLayerImplProps> = ({
  effect,
  layerIndex,
  ...props
}) => {
  effect.cloudLayers[layerIndex] = Object.assign(
    effect.cloudLayers[layerIndex] ?? {},
    props
  )
  if (props.densityProfile != null) {
    effect.cloudLayers[layerIndex].densityProfile = Object.assign(
      effect.cloudLayers[layerIndex].densityProfile ?? {},
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
          effect={effect}
          layerIndex={layerIndex++}
        />
      )
    })
  )
}
