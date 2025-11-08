import type { FC } from 'react'

import type { LiftGammaGainNode } from '../LiftGammaGainNode'
import { ColorWheel } from './ColorWheel'
import { ColorWheels, type ColorWheelsProps } from './ColorWheels'
import { useWheelProps } from './useWheelProps'

export interface LiftGammaGainProps extends ColorWheelsProps {
  node: LiftGammaGainNode
}

export const LiftGammaGain: FC<LiftGammaGainProps> = ({ node, ...props }) => (
  <ColorWheels {...props}>
    <ColorWheel name='Lift' {...useWheelProps(node, 'setLift')} />
    <ColorWheel name='Gamma' {...useWheelProps(node, 'setGamma')} />
    <ColorWheel name='Gain' {...useWheelProps(node, 'setGain')} />
  </ColorWheels>
)
