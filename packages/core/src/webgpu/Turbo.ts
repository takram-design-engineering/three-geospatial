import { Fn } from 'three/src/nodes/TSL.js'
import { add, mul, sub, vec3 } from 'three/tsl'

export const turbo = /*#__PURE__*/ Fn<[number]>(([x]) => {
  // prettier-ignore
  const r = add(0.1357, mul(x, sub(4.5974, mul(x, sub(42.3277, mul(x, sub(130.5887, mul(x, sub(150.5666, mul(x, 58.1375))))))))))
  // prettier-ignore
  const g = add(0.0914, mul(x, add(2.1856, mul(x, sub(4.8052, mul(x, sub(14.0195, mul(x, add(4.2109, mul(x, 2.7747))))))))))
  // prettier-ignore
  const b = add(0.1067, mul(x, sub(12.5925, mul(x, sub(60.1097, mul(x, sub(109.0745, mul(x, sub(88.5066, mul(x, 26.8183))))))))))
  return vec3(r, g, b)
})
