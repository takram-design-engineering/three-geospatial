import { Children, type FC, type ReactElement } from 'react'

import { type CloudsPass } from '../CloudsPass'
import { type CloudLayerProps } from './CloudLayer'

type CloudLayerChild =
  | ReactElement<CloudLayerProps>
  | boolean
  | null
  | undefined

export type CloudLayersChildren = CloudLayerChild | readonly CloudLayerChild[]

interface CloudLayerImplProps extends CloudLayerProps {
  pass: CloudsPass
  layerIndex: number
}

const CloudLayerImpl: FC<CloudLayerImplProps> = ({
  pass,
  layerIndex,
  ...props
}) => {
  pass.cloudLayers[layerIndex] = Object.assign(
    pass.cloudLayers[layerIndex] ?? {},
    props
  )
  if (props.densityProfile != null) {
    pass.cloudLayers[layerIndex].densityProfile = Object.assign(
      pass.cloudLayers[layerIndex].densityProfile ?? {},
      props.densityProfile
    )
  }
  return null
}

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
      return (
        <CloudLayerImpl
          key={layerIndex}
          {...child.props}
          pass={pass}
          layerIndex={layerIndex++}
        />
      )
    })
  )
}
