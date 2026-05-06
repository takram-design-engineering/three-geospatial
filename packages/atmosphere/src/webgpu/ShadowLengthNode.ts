// Based on Intel's Outdoor Light Scattering Sample: https://github.com/GameTechDev/OutdoorLightScattering

/**
 * Copyright 2017 Intel Corporation.
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
 *
 * Modified from the original source code.
 */

import {
  DirectionalLight,
  Matrix4,
  PerspectiveCamera,
  Vector2,
  Vector3,
  Vector4
} from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import {
  float,
  texture,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4
} from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { floorPowerOfTwo } from '@takram/three-geospatial'
import { OnBeforeFrameUpdate, type Node } from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import { CoordinateNode } from './ShadowLengthNode/CoordinateNode'
import { EpipolarShadowLengthNode } from './ShadowLengthNode/EpipolarShadowLengthNode'
import { MinMaxLevelsNode } from './ShadowLengthNode/MinMaxLevelsNode'
import { SliceEndpointsNode } from './ShadowLengthNode/SliceEndpointsNode'
import { SliceUVDirectionNode } from './ShadowLengthNode/SliceUVDirectionNode'
import { UnwarpEpipolarNode } from './ShadowLengthNode/UnwarpEpipolarNode'

const vector3Scratch = /*#__PURE__*/ new Vector3()
const vector4Scratch = /*#__PURE__*/ new Vector4()
const matrixScratch = /*#__PURE__*/ new Matrix4()
const sizeScratch = /*#__PURE__*/ new Vector2()

export class ShadowLengthNode extends TempNode {
  static override get type(): string {
    return 'ShadowLengthNode'
  }

  csmShadowNode: CSMShadowNode
  viewZUnitNode!: TextureNode // Must be filterable

  sliceEndpointsNode: SliceEndpointsNode
  coordinateNode: CoordinateNode
  sliceUVDirectionNode: SliceUVDirectionNode
  minMaxLevelsNode: MinMaxLevelsNode
  epipolarShadowLengthNode: EpipolarShadowLengthNode
  unwarpEpipolarNode: UnwarpEpipolarNode

  resolutionScale = 1
  autoSampleResolution = true

  // Good visual results can be obtained when number of slices is at least half
  // the maximum screen resolution (for 1280x720 resolution, good results are
  // obtained for 512-1024 slices).
  epipolarSliceCount = uniform(512, 'float')

  // Convincing visual results are generated when number of samples is at least
  // half the maximum screen resolution (for 1280x720 resolution, good results
  // are obtained for 512-1024 samples).
  maxSliceSampleCount = uniform(256, 'float')

  // First cascade used for ray marching.
  firstCascade = uniform(0, 'uint')

  private readonly screenSize = uniform('vec2')
  private readonly lightScreenPosition = uniform('vec4')
  private readonly isLightOnScreen = uniform('bool')

  private currentCascades = 0

  constructor(csmShadowNode: CSMShadowNode, viewZUnitNode: TextureNode) {
    super('vec2')
    this.updateType = NodeUpdateType.FRAME // After CSM's updateBefore

    this.csmShadowNode = csmShadowNode
    this.viewZUnitNode = viewZUnitNode

    this.sliceEndpointsNode = new SliceEndpointsNode()
    this.coordinateNode = new CoordinateNode()
    this.sliceUVDirectionNode = new SliceUVDirectionNode()
    this.minMaxLevelsNode = new MinMaxLevelsNode()
    this.epipolarShadowLengthNode = new EpipolarShadowLengthNode()
    this.unwarpEpipolarNode = new UnwarpEpipolarNode()
  }

  override customCacheKey(): number {
    return hash(this.currentCascades)
  }

  override update({ renderer, material }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { csmShadowNode } = this
    const { camera, light } = csmShadowNode
    if (camera == null || light == null) {
      return
    }
    invariant(light instanceof DirectionalLight)

    const { lights } = csmShadowNode
    if (lights.length !== this.currentCascades) {
      this.currentCascades = lights.length

      // Trigger update in the upstream.
      invariant(material instanceof NodeMaterial)
      material.fragmentNode!.needsUpdate = true
      material.needsUpdate = true
    }

    const viewProjection = matrixScratch.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    )
    const lightDirection = vector3Scratch
      .copy(light.position)
      .sub(light.target.position)
      .normalize()
    const lightClip = vector4Scratch
      .set(lightDirection.x, lightDirection.y, lightDirection.z, 0)
      .applyMatrix4(viewProjection)

    const lightW = lightClip.w
    let lightX = lightClip.x / lightW
    let lightY = lightClip.y / lightW
    const lightZ = lightClip.z / lightW

    const distanceToLightOnScreen = Math.hypot(lightX, lightY)
    const maxDistance = 100
    if (distanceToLightOnScreen > maxDistance) {
      const scale = maxDistance / distanceToLightOnScreen
      lightX *= scale
      lightY *= scale
    }
    this.lightScreenPosition.value.set(lightX, lightY, lightZ, lightW)

    const { width, height } = renderer
      .getDrawingBufferSize(sizeScratch)
      .multiplyScalar(this.resolutionScale)
    this.isLightOnScreen.value =
      Math.abs(lightX) <= 1 - 1 / width && Math.abs(lightY) <= 1 - 1 / height

    this.screenSize.value.set(width, height)

    if (this.autoSampleResolution) {
      const pixelRatio = renderer.getPixelRatio()
      const size = floorPowerOfTwo(Math.max(width, height) / pixelRatio)
      this.epipolarSliceCount.value = size
      this.maxSliceSampleCount.value = size >>> 1
    }
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      csmShadowNode,
      viewZUnitNode,
      sliceEndpointsNode,
      coordinateNode,
      sliceUVDirectionNode,
      minMaxLevelsNode,
      epipolarShadowLengthNode,
      unwarpEpipolarNode,
      epipolarSliceCount,
      maxSliceSampleCount,
      firstCascade,
      screenSize,
      lightScreenPosition,
      isLightOnScreen
    } = this

    const { camera, lights } = csmShadowNode
    if (camera == null || lights.length === 0) {
      return float()
    }
    invariant(camera instanceof PerspectiveCamera)

    const { parameters } = getAtmosphereContext(builder)
    const { worldToUnit } = parameters

    const maxShadowStep = uniform(1024 / 4, 'float')
    const shadowMapTexelSize = uniform('vec2')

    OnBeforeFrameUpdate(() => {
      const shadow = csmShadowNode.lights[0]?.shadow
      if (shadow != null) {
        maxShadowStep.value = shadow.mapSize.x / 4
        shadowMapTexelSize.value.set(1 / shadow.mapSize.x, 1 / shadow.mapSize.y)
      }
    })

    const { cascades: cascadeCount } = csmShadowNode

    const shadowCascadeArray = uniformArray(
      Array.from({ length: cascadeCount }, () => new Vector2()),
      'vec2'
    )
    OnBeforeFrameUpdate(() => {
      const array = shadowCascadeArray.array as Vector2[]
      const far = Math.min(camera.far, csmShadowNode.maxFar)
      const { _cascades: cascades } = csmShadowNode
      for (let i = 0; i < array.length; ++i) {
        const cascade = cascades[i]
        array[i].set(cascade.x, cascade.y).multiplyScalar(far * worldToUnit)
      }
    })

    const shadowMatrixArray = uniformArray(
      Array.from({ length: cascadeCount }, () => new Matrix4()),
      'mat4'
    )
    OnBeforeFrameUpdate(() => {
      const array = shadowMatrixArray.array as Matrix4[]
      const lights = csmShadowNode.lights
      const unitToWorld = 1 / worldToUnit
      matrixScratch.makeScale(unitToWorld, unitToWorld, unitToWorld)
      for (let i = 0; i < array.length; ++i) {
        const matrix = lights[i].shadow?.matrix
        if (matrix != null) {
          array[i].copy(matrix)
          array[i].multiply(matrixScratch)
        }
      }
    })

    const shadowDepthNodes = lights.map(light => {
      invariant(light.shadow?.map?.depthTexture != null)
      return texture(light.shadow.map.depthTexture)
    })

    sliceEndpointsNode.epipolarSliceCount = epipolarSliceCount
    sliceEndpointsNode.maxSliceSampleCount = maxSliceSampleCount
    sliceEndpointsNode.screenSize = screenSize
    sliceEndpointsNode.lightScreenPosition = lightScreenPosition
    sliceEndpointsNode.isLightOnScreen = isLightOnScreen
    const sliceEndpoints = sliceEndpointsNode.getTextureNode()

    coordinateNode.viewZUnitNode = viewZUnitNode
    coordinateNode.sliceEndpointsNode = sliceEndpoints
    coordinateNode.camera = camera
    coordinateNode.epipolarSliceCount = epipolarSliceCount
    coordinateNode.maxSliceSampleCount = maxSliceSampleCount
    coordinateNode.screenSize = screenSize
    const coordinate = coordinateNode.getTextureNode()

    sliceUVDirectionNode.csmShadowNode = csmShadowNode
    sliceUVDirectionNode.sliceEndpointsNode = sliceEndpoints
    sliceUVDirectionNode.camera = camera
    sliceUVDirectionNode.epipolarSliceCount = epipolarSliceCount
    sliceUVDirectionNode.maxSliceSampleCount = maxSliceSampleCount
    sliceUVDirectionNode.firstCascade = firstCascade
    sliceUVDirectionNode.screenSize = screenSize
    sliceUVDirectionNode.shadowMapTexelSize = shadowMapTexelSize
    sliceUVDirectionNode.shadowCascadeArray = shadowCascadeArray
    sliceUVDirectionNode.shadowMatrixArray = shadowMatrixArray
    const sliceUVDirection = sliceUVDirectionNode.getTextureNode()

    minMaxLevelsNode.csmShadowNode = csmShadowNode
    minMaxLevelsNode.sliceUVDirectionNode = sliceUVDirection
    minMaxLevelsNode.epipolarSliceCount = epipolarSliceCount
    minMaxLevelsNode.maxSliceSampleCount = maxSliceSampleCount
    minMaxLevelsNode.firstCascade = firstCascade
    minMaxLevelsNode.shadowDepthNodes = shadowDepthNodes
    const minMaxLevels = minMaxLevelsNode.getTextureNode()

    epipolarShadowLengthNode.csmShadowNode = csmShadowNode
    epipolarShadowLengthNode.coordinateNode = coordinate
    epipolarShadowLengthNode.sliceUVDirectionNode = sliceUVDirection
    epipolarShadowLengthNode.minMaxLevelsNode = minMaxLevels
    epipolarShadowLengthNode.camera = camera
    epipolarShadowLengthNode.epipolarSliceCount = epipolarSliceCount
    epipolarShadowLengthNode.maxSliceSampleCount = maxSliceSampleCount
    epipolarShadowLengthNode.firstCascade = firstCascade
    epipolarShadowLengthNode.maxShadowStep = maxShadowStep
    epipolarShadowLengthNode.shadowCascadeArray = shadowCascadeArray
    epipolarShadowLengthNode.shadowMatrixArray = shadowMatrixArray
    epipolarShadowLengthNode.shadowDepthNodes = shadowDepthNodes
    const epipolarShadowLength = epipolarShadowLengthNode.getTextureNode()

    unwarpEpipolarNode.sliceEndpointsNode = sliceEndpoints
    unwarpEpipolarNode.coordinateNode = coordinate
    unwarpEpipolarNode.epipolarShadowLengthNode = epipolarShadowLength
    unwarpEpipolarNode.viewZUnitNode = viewZUnitNode
    unwarpEpipolarNode.camera = camera
    unwarpEpipolarNode.epipolarSliceCount = epipolarSliceCount
    unwarpEpipolarNode.maxSliceSampleCount = maxSliceSampleCount
    unwarpEpipolarNode.screenSize = screenSize
    unwarpEpipolarNode.lightScreenPosition = lightScreenPosition
    const unwarpEpipolar = unwarpEpipolarNode.getTextureNode()

    return unwarpEpipolar
  }

  getDebugInternalTexturesNode(uvNode: Node<'vec2'> = uv()): Node<'vec3'> {
    const sliceEndpoints = this.sliceEndpointsNode.getTextureNode()
    const coordinate = this.coordinateNode.getTextureNode()
    const sliceUVDirection = this.sliceUVDirectionNode.getTextureNode()
    const minMaxLevels = this.minMaxLevelsNode.getTextureNode()
    const epipolarShadowLength = this.epipolarShadowLengthNode.getTextureNode()

    const uv1 = vec4(uvNode, uvNode.sub(0.5)).mul(2).toConst()
    const uv2 = vec3(uv1.x, uv1.yy.sub(vec2(0, 0.5)).mul(2)).toConst()
    return uvNode.y
      .lessThan(0.5)
      .select(
        uvNode.x
          .lessThan(0.5)
          .select(
            uv1.y
              .lessThan(0.5)
              .select(
                sliceEndpoints.sample(uv2.xy),
                sliceUVDirection.sample(uv2.xz)
              ),
            coordinate.sample(uv1.zy)
          ),
        uvNode.x
          .lessThan(0.5)
          .select(
            minMaxLevels.sample(uv1.xw),
            vec3(epipolarShadowLength.sample(uv1.zw).xy, 0)
          )
      ).rgb
  }

  override dispose(): void {
    this.sliceEndpointsNode.dispose()
    this.coordinateNode.dispose()
    this.sliceUVDirectionNode.dispose()
    this.minMaxLevelsNode.dispose()
    this.epipolarShadowLengthNode.dispose()
    this.unwarpEpipolarNode.dispose()
    super.dispose()
  }
}

export const shadowLength = (
  ...args: ConstructorParameters<typeof ShadowLengthNode>
): ShadowLengthNode => new ShadowLengthNode(...args)
