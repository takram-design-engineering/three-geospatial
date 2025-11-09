import type { FC } from 'react'

import type { LiftGammaGainNode } from '../LiftGammaGainNode'
import { ColorWheel } from './ColorWheel'
import { ColorWheels, type ColorWheelsProps } from './ColorWheels'
import { useColorWheelState } from './useColorWheelState'

export interface LiftGammaGainProps extends ColorWheelsProps {
  node: LiftGammaGainNode
}

export const LiftGammaGain: FC<LiftGammaGainProps> = ({ node, ...props }) => {
  const lift = useColorWheelState(node, 'setLift', [0, 0, 0])
  const gamma = useColorWheelState(node, 'setGamma', [0, 0, 0])
  const gain = useColorWheelState(node, 'setGain', [0, 0, 0])

  return (
    <ColorWheels {...props}>
      <ColorWheel name='Lift' {...lift} />
      <ColorWheel name='Gamma' {...gamma} />
      <ColorWheel name='Gain' {...gain} />
    </ColorWheels>
  )
}
