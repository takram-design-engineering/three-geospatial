import { type FC } from 'react'

import { type CloudLayer as CloudLayerData } from '../cloudLayer'

export interface CloudLayerProps extends Partial<CloudLayerData> {}

export const CloudLayer: FC<CloudLayerProps> = () => {
  return null
}
