import { add, sub, vec3 } from 'three/tsl'

import { Fnv } from './Fnv'
import type { Node, ShaderNode } from './node'

export const turbo = /*#__PURE__*/ Fnv(
  (x: ShaderNode<'float'>): Node<'vec3'> => {
    // prettier-ignore
    const r = add(0.1357, x.mul(sub(4.5974, x.mul(sub(42.3277, x.mul(sub(130.5887, x.mul(sub(150.5666, x.mul(58.1375))))))))))
    // prettier-ignore
    const g = add(0.0914, x.mul(add(2.1856, x.mul(sub(4.8052, x.mul(sub(14.0195, x.mul(add(4.2109, x.mul(2.7747))))))))))
    // prettier-ignore
    const b = add(0.1067, x.mul(sub(12.5925, x.mul(sub(60.1097, x.mul(sub(109.0745, x.mul(sub(88.5066, x.mul(26.8183))))))))))
    return vec3(r, g, b)
  }
)
