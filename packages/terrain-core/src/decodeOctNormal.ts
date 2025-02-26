import { Vector3 } from 'three'

function signNotZero(value: number): number {
  return value >= 0 ? 1 : -1
}

// Reference: https://github.com/CesiumGS/cesium/blob/1.122/packages/engine/Source/Core/AttributeCompression.js#L119
export function decodeOctNormal(
  octX: number,
  octY: number,
  result = new Vector3(),
  range = 255
): Vector3 {
  if (octX === 0 && octY === 0) {
    return result.setScalar(0)
  }
  let x = (octX / range) * 2 - 1
  let y = (octY / range) * 2 - 1
  const z = 1 - (Math.abs(x) + Math.abs(y))
  if (z < 0) {
    const oldX = x
    x = (1 - Math.abs(y)) * signNotZero(oldX)
    y = (1 - Math.abs(oldX)) * signNotZero(y)
  }
  return result.set(x, y, z).normalize()
}
