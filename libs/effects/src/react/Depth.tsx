import { wrapEffect } from '@react-three/postprocessing'
import { type ComponentPropsWithoutRef } from 'react'

import { DepthEffect } from '../DepthEffect'

export const Depth = wrapEffect(DepthEffect)

export type DepthProps = ComponentPropsWithoutRef<typeof Depth>