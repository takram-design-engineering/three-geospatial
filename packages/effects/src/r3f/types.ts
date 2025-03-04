import { type Node } from '@react-three/fiber'
import { type EffectConstructor } from '@react-three/postprocessing'
import { type BlendFunction } from 'postprocessing'

export type EffectProps<T extends EffectConstructor, Options = {}> = Node<
  InstanceType<T>,
  T
> &
  Options & {
    blendFunction?: BlendFunction
    opacity?: number
  }
