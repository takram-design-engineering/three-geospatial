import { type FC } from 'react'

import { type CloudLayer as CloudLayerData } from '../cloudLayer'

export interface CloudLayerProps extends CloudLayerData {}

export const CloudLayer: FC<CloudLayerProps> = props => {
  return null // This component is just for collecting props.
}
