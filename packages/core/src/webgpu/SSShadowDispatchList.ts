// Based on https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/

import { Vector4 } from 'three'
import { uniform } from 'three/tsl'

const GROUP_SIZE = 64

function toWaveIndex(value: number): number {
  return Math.floor(Math.max(0, value) / GROUP_SIZE)
}

export class SSShadowDispatch {
  readonly count: [number, number, number] = [0, 0, 0]
  readonly offset: [number, number] = [0, 0]

  copy(other: SSShadowDispatch): this {
    ;[this.count[0], this.count[1], this.count[2]] = other.count
    ;[this.offset[0], this.offset[1]] = other.offset
    return this
  }
}

export class SSShadowDispatchList {
  // xy: Screen coordinate
  // z: Normalized Z
  // w: Direction sign
  readonly lightCoordinate = uniform(new Vector4())

  readonly dispatches: readonly SSShadowDispatch[] = Array.from(
    // Populate the max number of dispatches
    { length: 8 },
    () => new SSShadowDispatch()
  )
  dispatchCount = 0

  update(
    lightProjection: [number, number, number, number],
    viewportWidth: number,
    viewportHeight: number
  ): void {
    // Floating point division in the shader has a practical limit for precision
    // when the light is *very* far off screen (~1m pixels+).
    // So when computing the light XY coordinate, use an adjusted w value to
    // handle these extreme values.
    let lightW = lightProjection[3]
    const fpLimit = 0.000002 * GROUP_SIZE
    if (lightW >= 0 && lightW < fpLimit) {
      lightW = fpLimit
    } else if (lightW < 0 && lightW > -fpLimit) {
      lightW = -fpLimit
    }

    // Need precise XY pixel coordinates of the light.
    this.lightCoordinate.value.set(
      ((lightProjection[0] / lightW) * 0.5 + 0.5) * viewportWidth,
      ((lightProjection[1] / lightW) * -0.5 + 0.5) * viewportHeight,
      lightProjection[3] === 0 ? 0 : lightProjection[2] / lightProjection[3],
      lightProjection[3] > 0 ? 1 : -1
    )

    const lightX = Math.round(this.lightCoordinate.value.x)
    const lightY = Math.round(this.lightCoordinate.value.y)

    // Make the bounds inclusive, relative to the light.
    const left = -lightX
    const bottom = -(viewportHeight - lightY)
    const right = viewportWidth - lightX
    const top = lightY

    // Process 4 quadrants around the light center.
    // They each form a rectangle with one corner on the light XY coordinate.
    // If the rectangle isn't square, it will need breaking in two on the larger
    // axis 0 = bottom left, 1 = bottom right, 2 = top left, 2 = top right.
    let dispatchCount = 0
    for (let q = 0; q < 4; ++q) {
      // Quads 0 and 3 needs to be +1 vertically, 1 and 2 need to be +1
      // horizontally.
      const vertical = q === 0 || q === 3
      const qx = (q & 1) > 0
      const qy = (q & 2) > 0

      // Bounds relative to the quadrant.
      const x1 = toWaveIndex(qx ? left : -right)
      const y1 = toWaveIndex(qy ? bottom : -top)
      const padX = GROUP_SIZE * (vertical ? 1 : 2) - 1
      const padY = GROUP_SIZE * (vertical ? 2 : 1) - 1
      const x2 = toWaveIndex((qx ? right : -left) + padX)
      const y2 = toWaveIndex((qy ? top : -bottom) + padY)

      if (x2 - x1 > 0 && y2 - y1 > 0) {
        const biasX = q === 2 || q === 3 ? 1 : 0
        const biasY = q === 1 || q === 3 ? 1 : 0

        const dispatch1 = this.dispatches[dispatchCount++]
        dispatch1.count[0] = GROUP_SIZE
        dispatch1.count[1] = x2 - x1
        dispatch1.count[2] = y2 - y1
        dispatch1.offset[0] = (qx ? x1 : -x2) + biasX
        dispatch1.offset[1] = (qy ? -y2 : y1) + biasY

        // We want the far corner of this quadrant relative to the light,
        // as we need to know where the diagonal light ray intersects with the
        // edge of the bounds.
        let axisDelta: number
        if (q === 0) {
          axisDelta = left - bottom
        } else if (q === 1) {
          axisDelta = right + bottom
        } else if (q === 2) {
          axisDelta = -left - top
        } else {
          axisDelta = -right + top
        }

        axisDelta = ((axisDelta + GROUP_SIZE - 1) / GROUP_SIZE) | 0

        if (axisDelta > 0) {
          // Take copy of current dispatch
          const dispatch2 = this.dispatches[dispatchCount++].copy(dispatch1)

          if (q === 0) {
            // Split on Y, split becomes -1 larger on x.
            dispatch2.count[2] = Math.min(dispatch1.count[2], axisDelta)
            dispatch1.count[2] -= dispatch2.count[2]
            dispatch2.offset[1] = dispatch1.offset[1] + dispatch1.count[2]
            dispatch2.offset[0] -= 1
            dispatch2.count[1] += 1
          } else if (q === 1) {
            // Split on X, split becomes +1 larger on y.
            dispatch2.count[1] = Math.min(dispatch1.count[1], axisDelta)
            dispatch1.count[1] -= dispatch2.count[1]
            dispatch2.offset[0] = dispatch1.offset[0] + dispatch1.count[1]
            dispatch2.count[2] += 1
          } else if (q === 2) {
            // Split on X, split becomes -1 larger on y.
            dispatch2.count[1] = Math.min(dispatch1.count[1], axisDelta)
            dispatch1.count[1] -= dispatch2.count[1]
            dispatch1.offset[0] += dispatch2.count[1]
            dispatch2.count[2] += 1
            dispatch2.offset[1] -= 1
          } else if (q === 3) {
            // Split on Y, split becomes +1 larger on x.
            dispatch2.count[2] = Math.min(dispatch1.count[2], axisDelta)
            dispatch1.count[2] -= dispatch2.count[2]
            dispatch1.offset[1] += dispatch2.count[2]
            ++dispatch2.count[1]
          }

          // Remove if too small.
          if (dispatch2.count[1] <= 0 || dispatch2.count[2] <= 0) {
            dispatch2.copy(this.dispatches[--dispatchCount])
          }
          if (dispatch1.count[1] <= 0 || dispatch1.count[2] <= 0) {
            dispatch1.copy(this.dispatches[--dispatchCount])
          }
        }
      }
    }

    // Scale the shader values by the wave count, the shader expects this.
    for (let i = 0; i < dispatchCount; ++i) {
      const dispatch = this.dispatches[i]
      dispatch.offset[0] *= GROUP_SIZE
      dispatch.offset[1] *= GROUP_SIZE
    }
    this.dispatchCount = dispatchCount
  }
}
