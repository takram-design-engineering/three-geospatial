import { type FC } from 'react'

import { type CloudLayer as CloudLayerData } from '../cloudLayer'
import { type CloudsPass } from '../CloudsPass'

export interface CloudLayerProps extends Partial<CloudLayerData> {
  pass?: CloudsPass
  layerIndex?: number
}

export const CloudLayer: FC<CloudLayerProps> = ({
  pass,
  layerIndex,
  ...props
}) => {
  if (pass == null || layerIndex == null) {
    return null
  }
  Object.assign(pass.cloudLayers[layerIndex], props)
  return null
}
