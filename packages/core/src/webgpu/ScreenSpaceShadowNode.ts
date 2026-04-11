// Based on Bend Studio's technique: https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/

/**
 * Copyright 2023 Sony Interactive Entertainment.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy of
 * the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations under
 * the License.
 */

import {
  LinearFilter,
  Matrix4,
  NoColorSpace,
  Vector2,
  Vector3,
  Vector4,
  type Camera,
  type DirectionalLight
} from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  abs,
  and,
  float,
  Fn,
  greaterThan,
  int,
  invocationLocalIndex,
  ivec2,
  min,
  mix,
  textureSize,
  textureStore,
  uniform,
  vec2,
  vec4,
  workgroupArray,
  workgroupBarrier,
  workgroupId
} from 'three/tsl'
import {
  NodeUpdateType,
  StorageTexture,
  TempNode,
  type ComputeNode,
  type Node,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { cameraFar, cameraNear } from './accessors'
import { outputTexture } from './OutputTextureNode'
import { logarithmicToPerspectiveDepth } from './transformations'

// Workgroup size of the compute shader running this code.
const GROUP_SIZE = 64

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

export class ScreenSpaceShadowNode extends TempNode {
  override get type(): string {
    return 'ScreenSpaceShadowNode'
  }

  depthNode: TextureNode
  camera: Camera
  mainLight: DirectionalLight

  sampleCount = 60
  hardShadowSamples = 4
  fadeOutSamples = 8

  readonly outputTexture: StorageTexture
  private readonly textureNode: TextureNode

  thickness = uniform(0.005)
  shadowContrast = uniform(4)
  shadowIntensity = uniform(1)
  bilinearThreshold = uniform(0.02)

  // xy: Screen coordinate
  // z: Normalized Z
  // w: Direction sign
  private readonly lightCoordinate = uniform('vec4')
  private readonly dispatchOffset = uniform('ivec2')
  private readonly dispatchIndex = uniform(0)

  private readonly dispatches: readonly Dispatch[] = Array.from(
    // Populate the max number of dispatches
    { length: 8 },
    () => new Dispatch()
  )
  private dispatchCount = 0

  private computeNode?: ComputeNode

  constructor(
    depthNode: TextureNode,
    camera: Camera,
    mainLight: DirectionalLight
  ) {
    super('float')
    this.depthNode = depthNode
    this.camera = camera
    this.mainLight = mainLight

    const texture = new StorageTexture(1, 1)
    texture.colorSpace = NoColorSpace
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.generateMipmaps = false
    texture.name = 'ScreenSpaceShadowNode'

    this.outputTexture = texture
    this.textureNode = outputTexture(this, texture)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override customCacheKey(): number {
    return hash(
      this.camera?.id ?? -1,
      this.mainLight?.id ?? -1,
      this.sampleCount,
      this.hardShadowSamples,
      this.fadeOutSamples
    )
  }

  getTextureNode(): TextureNode {
    return this.textureNode
  }

  setSize(width: number, height: number): this {
    const { outputTexture } = this
    if (width !== outputTexture.width || height !== outputTexture.height) {
      outputTexture.setSize(width, height, 0)
      outputTexture.needsUpdate = true
    }
    return this
  }

  override updateBefore(frame: NodeFrame): boolean | undefined {
    const { renderer } = frame
    if (renderer == null) {
      return
    }

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.setSize(size.width, size.height)

    const { camera, mainLight } = this

    // Compute light projection and update dispatch list.
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

    invariant(this.computeNode != null)
    for (let index = 0; index < this.dispatchCount; ++index) {
      const dispatch = this.dispatches[index]
      this.dispatchOffset.value.set(dispatch.offset.x, dispatch.offset.y)
      this.dispatchIndex.value = index
      void renderer.compute(this.computeNode, dispatch.size)
    }
  }

  // See bend_sss_cpu.h
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
    // axis 0 = bottom left, 1 = bottom right, 2 = top left, 3 = top right.
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

    // Scale the shader values by the workgroup size, the shader expects this.
    for (let i = 0; i < dispatchCount; ++i) {
      const dispatch = this.dispatches[i]
      dispatch.offset.x *= GROUP_SIZE
      dispatch.offset.y *= GROUP_SIZE
    }
    this.dispatchCount = dispatchCount
  }

  // See bend_sss_gpu.h
  private setupCompute(builder: NodeBuilder): void {
    const {
      depthNode,
      camera,
      sampleCount,
      hardShadowSamples,
      fadeOutSamples,
      outputTexture,
      thickness,
      shadowContrast,
      shadowIntensity,
      bilinearThreshold,
      lightCoordinate,
      dispatchOffset
    } = this

    const [nearDepth, farDepth] = builder.renderer.reversedDepthBuffer
      ? [float(1), float(0)]
      : [float(0), float(1)]

    // Number of bilinear sample reads performed per-thread.
    const readCount = Math.floor(sampleCount / GROUP_SIZE) + 2
    const workgroupBuffer = workgroupArray('float', readCount * GROUP_SIZE)

    // Gets the start pixel coordinates for the pixels in the workgroup.
    // Also returns the delta to get to the next pixel after GROUP_SIZE pixels
    // along the ray.
    const getWorkgroupExtents = (): {
      pixelXY: Node<'vec2'>
      pixelDistance: Node<'float'>
      xyDelta: Node<'vec2'>
      xAxisMajor: Node<'bool'>
    } => {
      const xy = ivec2(workgroupId.yz)
        .mul(GROUP_SIZE)
        .add(dispatchOffset)
        .toConst()

      // Integer light position / fractional component
      const lightXY = lightCoordinate.xy.floor().add(0.5).toConst()
      const lightXYFraction = lightCoordinate.xy.sub(lightXY).toConst()
      const reverseDirection = lightCoordinate.w.greaterThan(0)

      const signXY = ivec2(xy.sign()).toConst()

      const horizontal = abs(xy.x.add(signXY.y))
        .lessThan(abs(xy.y.sub(signXY.x)))
        .toConst()

      const axis = ivec2(
        horizontal.select(signXY.y, 0),
        horizontal.select(0, signXY.x.negate())
      )

      // Apply workgroup offset along the axis
      const xyF = vec2(axis.mul(workgroupId.x).add(xy)).toConst()

      // For interpolation to the light center, we only really care about the
      // larger of the two axis.
      const xAxisMajor = abs(xyF.x).greaterThan(abs(xyF.y)).toConst()
      const majorAxis = xAxisMajor.select(xyF.x, xyF.y).toConst()

      const majorAxisStart = majorAxis.abs().toConst()
      const majorAxisEnd = majorAxisStart.sub(GROUP_SIZE)

      const maLightFrac = xAxisMajor
        .select(lightXYFraction.x, lightXYFraction.y)
        .toVar()
      maLightFrac.assign(
        majorAxis.greaterThan(0).select(maLightFrac.negate(), maLightFrac)
      )

      // Back in to screen direction.
      const startXY = xyF.add(lightXY).toConst()

      // For the very inner most ring, we need to interpolate to a pixel
      // centered UV, so the UV->pixel rounding doesn't skip output pixels.
      const endXY = mix(
        lightCoordinate.xy,
        startXY,
        majorAxisEnd.add(maLightFrac).div(majorAxisStart.add(maLightFrac))
      ).toConst()

      // The major axis should be a round number.
      const xyDelta = startXY.sub(endXY).toConst()

      // Inverse the read order when reverse direction is true.
      const threadStep = float(
        reverseDirection.select(
          invocationLocalIndex,
          invocationLocalIndex.bitXor(GROUP_SIZE - 1)
        )
      ).toConst()

      const pixelXY = mix(startXY, endXY, threadStep.div(GROUP_SIZE)).toVar()
      const pixelDistance = majorAxisStart
        .sub(threadStep)
        .add(maLightFrac)
        .toConst()

      return { pixelXY, pixelDistance, xyDelta, xAxisMajor }
    }

    const loadDepth = (coord: Node<'ivec2'>): Node<'float'> => {
      let depth: Node = depthNode.load(coord)
      if (builder.renderer.logarithmicDepthBuffer) {
        depth = logarithmicToPerspectiveDepth(
          depth,
          cameraNear(camera),
          cameraFar(camera)
        )
      }
      depth = depth.toConst()

      // Emulate a point sampler in bend_sss_gpu.h, with Wrap Mode set to
      // Clamp-To-Border-Color, and Border Color set to farDepth.
      return and(
        coord.greaterThanEqual(0).all(),
        coord.lessThan(textureSize(depthNode)).all()
      ).select(depth, farDepth)
    }

    this.computeNode = Fn(() => {
      const { pixelXY, xyDelta, pixelDistance, xAxisMajor } =
        getWorkgroupExtents()

      const direction = lightCoordinate.w.negate()
      const zSign = nearDepth.greaterThan(farDepth).select(-1, 1).toConst()

      // Must save pixelXY here before modifying it.
      const writeXY = ivec2(pixelXY.floor()).toConst()

      let samplingDepth0!: Node<'float'>
      let depthThicknessScale0!: Node<'float'>
      let sampleDistance0!: Node<'float'>

      for (let i = 0; i < readCount; ++i) {
        // We sample depth twice per pixel per sample, and interpolate with an
        // edge detect filter. Interpolation should only occur on the minor axis
        // of the ray - major axis coordinates should be at pixel centers.
        const readXY = ivec2(pixelXY.floor()).toConst()
        const minorAxis = xAxisMajor.select(pixelXY.y, pixelXY.x)

        const bias = minorAxis
          .fract()
          .sub(0.5)
          .greaterThan(0)
          .select(1, -1)
          .toConst()
        const bilinearOffset = ivec2(
          xAxisMajor.select(0, bias),
          xAxisMajor.select(bias, 0)
        )

        const depthCenter = loadDepth(readXY).toConst()
        const depthNeighbor = loadDepth(readXY.add(bilinearOffset)).toConst()

        // Depth thresholds (bilinear/shadow thickness) are based on a
        // fractional ratio of the difference between sampled depth and the far
        // clip depth.
        const depthThicknessScale = farDepth.sub(depthCenter).abs().toConst()

        // If depth variance is more than a specific threshold, then just use
        // point filtering.
        const usePointFilter = greaterThan(
          depthCenter.sub(depthNeighbor).abs(),
          depthThicknessScale.mul(bilinearThreshold)
        )

        // Any sample in this workgroup is possibly interpolated towards the
        // bilinear sample. So we should use a shadowing depth that is further
        // away, based on the difference between the two samples.
        const shadowDepth = depthCenter.add(
          abs(depthCenter.sub(depthNeighbor)).mul(zSign)
        )

        // Shadows cast from this depth.
        const shadowingDepth = usePointFilter.select(depthCenter, shadowDepth)

        const sampleDistance =
          i === 0
            ? pixelDistance
            : direction
                .mul(GROUP_SIZE * i)
                .add(pixelDistance)
                .toConst()

        // Perspective correct the shadowing depth, in this space, all light
        // rays are parallel.
        let storedDepth: Node = shadowingDepth
          .sub(lightCoordinate.z)
          .div(sampleDistance)
          .toConst()

        if (i > 0) {
          // For pixels within sampling distance of the light, it is possible
          // that sampling will overshoot the light coordinate for extended
          // reads. We want to ignore these samples.
          storedDepth = sampleDistance
            .greaterThan(0)
            .select(storedDepth, 1e10)
            .toConst()
        }

        // Store the depth values in workgroup shared memory.
        workgroupBuffer
          .element(invocationLocalIndex.add(GROUP_SIZE * i))
          .assign(storedDepth)

        if (i === 0) {
          samplingDepth0 = depthCenter
          depthThicknessScale0 = depthThicknessScale
          sampleDistance0 = sampleDistance
        }

        // Iterate to the next pixel along the ray. This will be GROUP_SIZE
        // pixels along the ray...
        pixelXY.addAssign(xyDelta.mul(direction))
      }

      // Sync threads within the workgroup now workgroupDepthData is written.
      workgroupBarrier()

      // Perspective correct the depth.
      const startDepth = samplingDepth0
        .sub(lightCoordinate.z)
        .div(sampleDistance0)
        .toVar()

      // This is the inverse of how large the shadowing window is for the
      // projected sample data.
      // All values in the workgroup shared memory are scaled by
      // 1.0 / sample_distance, such that all light directions become parallel.
      // The multiply by sample_distance[0] here is to compensate for the
      // projection divide in the data.
      // The 1.0 / SurfaceThickness is to adjust user selected thickness. So a
      // 0.5% thickness will scale depth values from [0,1] to [0,200]. The
      // shadow window is always 1 wide.
      // 1.0 / depth_thickness_scale[0] is because SurfaceThickness is
      // percentage of remaining depth between the sample and the far clip - not
      // a percentage of the full depth range.
      // The min() function is to make sure the window is a minimum width when
      // very close to the light. The +direction term will bias the result so
      // the pixel at the very center of the light is either fully lit or
      // shadowed.
      const depthScale = sampleDistance0
        .add(direction)
        .min(thickness.reciprocal())
        .mul(sampleDistance0)
        .div(depthThicknessScale0)
        .toConst()

      startDepth.assign(startDepth.mul(depthScale).sub(zSign))

      // Start by reading the next value.
      const sampleIndex = invocationLocalIndex.add(1).toConst()
      const hardShadow = float(1).toVar()

      // The first number of hard shadow samples, a single pixel can produce a
      // full shadow:
      for (let i = 0; i < hardShadowSamples; ++i) {
        const depthDelta = startDepth
          .sub(workgroupBuffer.element(sampleIndex.add(i)).mul(depthScale))
          .abs()

        // We want to find the distance of the sample that is closest to the
        // reference depth.
        hardShadow.assign(hardShadow.min(depthDelta))
      }

      const shadowValue = vec4(1).toVar()

      // The main shadow samples, averaged in to a set of 4 shadow values:
      for (let i = hardShadowSamples; i < sampleCount - fadeOutSamples; ++i) {
        const depthDelta = startDepth
          .sub(workgroupBuffer.element(sampleIndex.add(i)).mul(depthScale))
          .abs()

        // Do the same as the hard_shadow code above, but this will accumulate
        // to 4 separate values. By using 4 values, the average shadow can be
        // taken, which can help soften single-pixel shadows.
        const channel = int(i & 3).toConst()
        shadowValue
          .element(channel)
          .assign(shadowValue.element(channel).min(depthDelta))
      }

      // Final fade out samples:
      for (let i = sampleCount - fadeOutSamples; i < sampleCount; ++i) {
        const depthDelta = startDepth
          .sub(workgroupBuffer.element(sampleIndex.add(i)).mul(depthScale))
          .abs()

        // Add the fade value to these samples.
        const fadeOut =
          ((i + 1 - (sampleCount - fadeOutSamples)) / (fadeOutSamples + 1)) *
          0.75

        const channel = int(i & 3).toConst()
        shadowValue
          .element(channel)
          .assign(shadowValue.element(channel).min(depthDelta.add(fadeOut)))
      }

      // Apply the contrast value.
      // A value of 0 indicates a sample was exactly matched to the reference
      // depth (and the result is fully shadowed). We want some boost to this
      // range, so samples don't have to exactly match to produce a full shadow.
      const contrastOffset = shadowContrast.oneMinus().toConst()
      hardShadow.assign(
        hardShadow.mul(shadowContrast).add(contrastOffset).saturate()
      )
      shadowValue.assign(
        shadowValue.mul(shadowContrast).add(contrastOffset).saturate()
      )

      const result = float(0).toVar()

      // Take the average of 4 samples, this is useful to reduce aliasing noise
      // in the source depth, especially with long shadows.
      result.assign(shadowValue.dot(vec4(0.25)))

      // If the first samples are always producing a hard shadow, then compute
      // this value separately.
      result.assign(min(hardShadow, result))

      // Asking the GPU to write scattered single-byte pixels isn't great,
      // But thankfully the latency is hidden by all the work we're doing...
      textureStore(outputTexture, writeXY, mix(1, result, shadowIntensity))
    })().compute(
      0, // Determine this later
      [GROUP_SIZE, 1, 1]
    )
  }

  override setup(builder: NodeBuilder): TextureNode {
    this.setupCompute(builder)
    return this.textureNode
  }

  override dispose(): void {
    this.outputTexture.dispose()
  }
}

export const screenSpaceShadow = (
  ...args: ConstructorParameters<typeof ScreenSpaceShadowNode>
): ScreenSpaceShadowNode => new ScreenSpaceShadowNode(...args)
