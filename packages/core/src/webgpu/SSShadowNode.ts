import {
  Matrix4,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type DirectionalLight
} from 'three'
import {
  abs,
  float,
  Fn,
  int,
  invocationLocalIndex,
  ivec2,
  mix,
  uniform,
  vec2,
  workgroupId
} from 'three/tsl'
import {
  NodeUpdateType,
  TempNode,
  type ComputeNode,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'

import type { Node } from './node'

const GROUP_SIZE = 64
const SAMPLE_COUNT = 60
const READ_COUNT = SAMPLE_COUNT / GROUP_SIZE + 2

function toDispatchIndex(value: number): number {
  return Math.floor(Math.max(0, value) / GROUP_SIZE)
}

class Dispatch {
  readonly size = [0, 0, 0]
  readonly offset = { x: 0, y: 0 }

  copy(other: Dispatch): this {
    ;[this.size[0], this.size[1], this.size[2]] = other.size
    this.offset.x = other.offset.x
    this.offset.y = other.offset.y
    return this
  }
}

const vector3Scratch = /*#__PURE__*/ new Vector3()
const vector4Scratch = /*#__PURE__*/ new Vector4()
const sizeScratch = /*#__PURE__*/ new Vector2()
const matrixScratch = /*#__PURE__*/ new Matrix4()

export class SSShadowNode extends TempNode {
  depthNode: TextureNode
  camera?: Camera | null
  mainLight?: DirectionalLight | null

  private computeNode!: ComputeNode

  // xy: Screen coordinate
  // z: Normalized Z
  // w: Direction sign
  readonly lightCoordinate = uniform(new Vector4())
  readonly dispatchOffset = uniform(new Vector2(), 'uvec2')
  readonly dispatchIndex = uniform(0)

  private readonly dispatches: readonly Dispatch[] = Array.from(
    // Populate the max number of dispatches
    { length: 8 },
    () => new Dispatch()
  )
  private dispatchCount = 0

  constructor(
    depthNode: TextureNode,
    camera?: Camera | null,
    mainLight?: DirectionalLight | null
  ) {
    super('float')
    this.depthNode = depthNode
    this.camera = camera
    this.mainLight = mainLight

    this.updateBeforeType = NodeUpdateType.RENDER
  }

  override updateBefore(frame: NodeFrame): void {
    const { renderer } = frame
    const { camera, mainLight } = this
    if (renderer == null || camera == null || mainLight == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)

    // Compute light projection and update dispatch list:
    const viewProjection = matrixScratch.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
    const direction = vector3Scratch
      .copy(mainLight.position)
      .sub(mainLight.target.position)
      .normalize()
    const lightProjection = vector4Scratch
      .set(direction.x, direction.y, direction.z, 0)
      .applyMatrix4(viewProjection)

    this.updateDispatchList(lightProjection, size)

    for (let index = 0; index < this.dispatchCount; ++index) {
      const { size, offset } = this.dispatches[index]
      this.dispatchOffset.value.set(offset.x, offset.y)
      this.dispatchIndex.value = index
      void renderer.compute(this.computeNode, size)
    }
  }

  private updateDispatchList(
    lightProjection: Vector4,
    { width, height }: Vector2
  ): void {
    // Floating point division in the shader has a practical limit for precision
    // when the light is *very* far off screen (~1m pixels+).
    // So when computing the light XY coordinate, use an adjusted w value to
    // handle these extreme values.
    let lightW = lightProjection.w
    const fpLimit = 0.000002 * GROUP_SIZE
    if (lightW >= 0 && lightW < fpLimit) {
      lightW = fpLimit
    } else if (lightW < 0 && lightW > -fpLimit) {
      lightW = -fpLimit
    }

    // Need precise XY pixel coordinates of the light.
    this.lightCoordinate.value.set(
      ((lightProjection.x / lightW) * 0.5 + 0.5) * width,
      ((lightProjection.y / lightW) * -0.5 + 0.5) * height,
      lightProjection.w === 0 ? 0 : lightProjection.z / lightProjection.w,
      lightProjection.w > 0 ? 1 : -1
    )

    const lightX = Math.round(this.lightCoordinate.value.x)
    const lightY = Math.round(this.lightCoordinate.value.y)

    // Make the bounds inclusive, relative to the light.
    const left = -lightX
    const bottom = -(height - lightY)
    const right = width - lightX
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
      const x1 = toDispatchIndex(qx ? left : -right)
      const y1 = toDispatchIndex(qy ? bottom : -top)
      const padX = GROUP_SIZE * (vertical ? 1 : 2) - 1
      const padY = GROUP_SIZE * (vertical ? 2 : 1) - 1
      const x2 = toDispatchIndex((qx ? right : -left) + padX)
      const y2 = toDispatchIndex((qy ? top : -bottom) + padY)

      if (x2 - x1 > 0 && y2 - y1 > 0) {
        const biasX = q === 2 || q === 3 ? 1 : 0
        const biasY = q === 1 || q === 3 ? 1 : 0

        const dispatch1 = this.dispatches[dispatchCount++]
        dispatch1.size[0] = GROUP_SIZE
        dispatch1.size[1] = x2 - x1
        dispatch1.size[2] = y2 - y1
        dispatch1.offset.x = (qx ? x1 : -x2) + biasX
        dispatch1.offset.y = (qy ? -y2 : y1) + biasY

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
            dispatch2.size[2] = Math.min(dispatch1.size[2], axisDelta)
            dispatch1.size[2] -= dispatch2.size[2]
            dispatch2.offset.y = dispatch1.offset.y + dispatch1.size[2]
            dispatch2.offset.x -= 1
            dispatch2.size[1] += 1
          } else if (q === 1) {
            // Split on X, split becomes +1 larger on y.
            dispatch2.size[1] = Math.min(dispatch1.size[1], axisDelta)
            dispatch1.size[1] -= dispatch2.size[1]
            dispatch2.offset.x = dispatch1.offset.x + dispatch1.size[1]
            dispatch2.size[2] += 1
          } else if (q === 2) {
            // Split on X, split becomes -1 larger on y.
            dispatch2.size[1] = Math.min(dispatch1.size[1], axisDelta)
            dispatch1.size[1] -= dispatch2.size[1]
            dispatch1.offset.x += dispatch2.size[1]
            dispatch2.size[2] += 1
            dispatch2.offset.y -= 1
          } else if (q === 3) {
            // Split on Y, split becomes +1 larger on x.
            dispatch2.size[2] = Math.min(dispatch1.size[2], axisDelta)
            dispatch1.size[2] -= dispatch2.size[2]
            dispatch1.offset.y += dispatch2.size[2]
            ++dispatch2.size[1]
          }

          // Remove if too small.
          if (dispatch2.size[1] <= 0 || dispatch2.size[2] <= 0) {
            dispatch2.copy(this.dispatches[--dispatchCount])
          }
          if (dispatch1.size[1] <= 0 || dispatch1.size[2] <= 0) {
            dispatch1.copy(this.dispatches[--dispatchCount])
          }
        }
      }
    }

    // Scale the shader values by the wave count, the shader expects this.
    for (let i = 0; i < dispatchCount; ++i) {
      const dispatch = this.dispatches[i]
      dispatch.offset.x *= GROUP_SIZE
      dispatch.offset.y *= GROUP_SIZE
    }
    this.dispatchCount = dispatchCount
  }

  private setupCompute(): void {
    const { lightCoordinate, dispatchOffset } = this

    const getWavefrontExtents = (): {
      pixelXY: Node<'vec2'>
      pixelDistance: Node<'float'>
      xyDelta: Node<'vec2'>
      xAxisMajor: Node<'bool'>
    } => {
      const xy = workgroupId.yz.mul(GROUP_SIZE).add(dispatchOffset).toVar()

      // Integer light position / fractional component
      const lightXY = lightCoordinate.xy.floor().add(0.5).toVar()
      const lightXYFraction = lightCoordinate.xy.sub(lightXY).toVar()
      const reverseDirection = lightCoordinate.w.greaterThan(0)

      const signXY = ivec2(xy.sign()).toVar()

      const horizontal = abs(xy.x.add(signXY.y))
        .lessThan(abs(xy.y.sub(signXY.x)))
        .toVar()

      const axis = ivec2(
        horizontal.select(signXY.y, int(0)),
        horizontal.select(int(0), signXY.x.negate())
      )

      // Apply wave offset
      const xyF = vec2(axis.mul(workgroupId.x).add(xy)).toVar()

      // For interpolation to the light center, we only really care about the
      // larger of the two axis.
      const xAxisMajor = abs(xyF.x).greaterThan(abs(xyF.y)).toVar()
      const majorAxis = xAxisMajor.select(xyF.x, xyF.y).toVar()

      const majorAxisStart = majorAxis.abs().toVar()
      const majorAxisEnd = majorAxisStart.sub(GROUP_SIZE)

      const maLightFrac = xAxisMajor
        .select(lightXYFraction.x, lightXYFraction.y)
        .toVar()
      maLightFrac.assign(
        majorAxis.greaterThan(0).select(maLightFrac.negate(), maLightFrac)
      )

      // Back in to screen direction.
      const startXY = xyF.add(lightXY).toVar()

      // For the very inner most ring, we need to interpolate to a pixel
      // centered UV, so the UV->pixel rounding doesn't skip output pixels.
      const endXY = mix(
        lightCoordinate.xy,
        startXY,
        majorAxisEnd.add(maLightFrac).div(majorAxisStart.add(maLightFrac))
      ).toVar()

      // The major axis should be a round number.
      const xyDelta = startXY.sub(endXY).toVar()

      // Inverse the read order when reverse direction is true.
      const threadStep = float(
        reverseDirection.select(
          invocationLocalIndex,
          invocationLocalIndex.bitXor(GROUP_SIZE - 1)
        )
      ).toVar()

      const pixelXY = mix(startXY, endXY, threadStep.div(GROUP_SIZE)).toVar()
      const pixelDistance = majorAxisStart
        .sub(threadStep)
        .add(maLightFrac)
        .toVar()

      return { pixelXY, pixelDistance, xyDelta, xAxisMajor }
    }

    this.computeNode ??= Fn(() => {
      const { pixelXY, xyDelta, pixelDistance } = getWavefrontExtents()
    })()
      // @ts-expect-error "count" can be dimensional
      .compute([GROUP_SIZE, 1, 1], [GROUP_SIZE, 1, 1])
  }
}
