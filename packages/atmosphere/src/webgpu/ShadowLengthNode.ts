import { DirectionalLight } from 'three'
import type { CSMShadowNode } from 'three/examples/jsm/csm/CSMShadowNode.js'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { float, texture, uniform, uniformArray } from 'three/tsl'
import {
  Matrix4,
  NodeMaterial,
  NodeUpdateType,
  PerspectiveCamera,
  TempNode,
  Vector2,
  Vector3,
  Vector4,
  type NodeBuilder,
  type NodeFrame,
  type TextureNode
} from 'three/webgpu'
import invariant from 'tiny-invariant'

import { OnBeforeFrameUpdate } from '@takram/three-geospatial/webgpu'

import { CoordinateNode } from './ShadowLengthNode/CoordinateNode'
import { EpipolarShadowLengthNode } from './ShadowLengthNode/EpipolarShadowLengthNode'
import { MinMaxLevelsNode } from './ShadowLengthNode/MinMaxLevelsNode'
import { SliceEndpointsNode } from './ShadowLengthNode/SliceEndpointsNode'
import { SliceUVDirectionNode } from './ShadowLengthNode/SliceUVDirectionNode'
import { UnwarpEpipolarNode } from './ShadowLengthNode/UnwarpEpipolarNode'

declare module 'three/examples/jsm/csm/CSMShadowNode.js' {
  interface CSMShadowNode {
    _cascades: Vector2[] // TODO
  }
}

const vector3Scratch = /*#__PURE__*/ new Vector3()
const vector4Scratch = /*#__PURE__*/ new Vector4()
const matrixScratch = /*#__PURE__*/ new Matrix4()
const sizeScratch = /*#__PURE__*/ new Vector2()

export class ShadowLengthNode extends TempNode {
  static override get type(): string {
    return 'ShadowLengthNode'
  }

  csmShadowNode: CSMShadowNode
  viewZNode?: TextureNode | null // Must be filterable
  depthNode?: TextureNode | null

  sliceEndpointsNode: SliceEndpointsNode
  coordinateNode: CoordinateNode
  sliceUVDirectionNode: SliceUVDirectionNode
  minMaxLevelsNode: MinMaxLevelsNode
  epipolarShadowLengthNode: EpipolarShadowLengthNode
  unwarpEpipolarNode: UnwarpEpipolarNode

  // Good visual results can be obtained when number of slices is at least half
  // the maximum screen resolution (for 1280x720 resolution, good results are
  // obtained for 512-1024 slices).
  numEpipolarSlices = 512

  // Convincing visual results are generated when number of samples is at least
  // half the maximum screen resolution (for 1280x720 resolution, good results
  // are obtained for 512-1024 samples).
  maxSamplesInSlice = 256

  firstCascade = uniform(0, 'uint')

  private readonly screenSize = uniform('vec2')
  private readonly lightScreenPosition = uniform('vec4')
  private readonly isLightOnScreen = uniform('bool')

  private currentCascades = 0

  constructor(
    csmShadowNode: CSMShadowNode,
    viewZNode?: TextureNode | null,
    depthNode?: TextureNode | null
  ) {
    super('float')
    this.updateBeforeType = NodeUpdateType.RENDER // TODO

    this.csmShadowNode = csmShadowNode
    this.viewZNode = viewZNode
    this.depthNode = depthNode

    this.sliceEndpointsNode = new SliceEndpointsNode()
    this.coordinateNode = new CoordinateNode()
    this.sliceUVDirectionNode = new SliceUVDirectionNode()
    this.minMaxLevelsNode = new MinMaxLevelsNode()
    this.epipolarShadowLengthNode = new EpipolarShadowLengthNode()
    this.unwarpEpipolarNode = new UnwarpEpipolarNode()
  }

  override customCacheKey(): number {
    return hash(
      this.numEpipolarSlices,
      this.maxSamplesInSlice,
      this.currentCascades
    )
  }

  override updateBefore({ renderer, material }: NodeFrame): void {
    if (renderer == null) {
      return
    }

    const { csmShadowNode } = this
    const { camera, light } = csmShadowNode
    if (camera == null || light == null) {
      return
    }
    invariant(camera instanceof PerspectiveCamera)
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

    const size = renderer.getDrawingBufferSize(sizeScratch)
    this.isLightOnScreen.value =
      Math.abs(lightX) <= 1 - 1 / size.width &&
      Math.abs(lightY) <= 1 - 1 / size.height

    this.screenSize.value.copy(size)
  }

  override setup(builder: NodeBuilder): unknown {
    const {
      csmShadowNode,
      viewZNode,
      depthNode,
      sliceEndpointsNode,
      coordinateNode,
      sliceUVDirectionNode,
      minMaxLevelsNode,
      epipolarShadowLengthNode,
      unwarpEpipolarNode,
      numEpipolarSlices,
      maxSamplesInSlice,
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

    const maxShadowStep = uniform(1024 / 4, 'float')
    const shadowMapTexelSize = uniform('vec2')

    OnBeforeFrameUpdate(() => {
      const shadow = csmShadowNode.lights[0]?.shadow
      if (shadow != null) {
        maxShadowStep.value = shadow.mapSize.x / 4
        shadowMapTexelSize.value.set(1 / shadow.mapSize.x, 1 / shadow.mapSize.y)
      }
    })

    const shadowCascadeArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Vector2()),
      'vec2'
    )
    OnBeforeFrameUpdate(() => {
      const array = shadowCascadeArray.array as Vector2[]
      const far = Math.min(camera.far, csmShadowNode.maxFar)
      const cascades = csmShadowNode._cascades
      for (let i = 0; i < array.length; ++i) {
        const cascade = cascades[i]
        array[i].set(cascade.x * far, cascade.y * far)
      }
    })

    const shadowMatrixArray = uniformArray(
      Array.from({ length: csmShadowNode.cascades }, () => new Matrix4()),
      'mat4'
    )
    OnBeforeFrameUpdate(() => {
      const array = shadowMatrixArray.array as Matrix4[]
      const lights = csmShadowNode.lights
      for (let i = 0; i < array.length; ++i) {
        const matrix = lights[i].shadow?.matrix
        if (matrix != null) {
          array[i].copy(matrix)
        }
      }
    })

    const shadowDepthNodes = lights.map(light => {
      invariant(light.shadow?.map?.depthTexture != null)
      return texture(light.shadow.map.depthTexture)
    })

    sliceEndpointsNode.numEpipolarSlices = numEpipolarSlices
    sliceEndpointsNode.maxSamplesInSlice = maxSamplesInSlice
    sliceEndpointsNode.screenSize = screenSize
    sliceEndpointsNode.lightScreenPosition = lightScreenPosition
    sliceEndpointsNode.isLightOnScreen = isLightOnScreen
    const sliceEndpoints = sliceEndpointsNode.getTextureNode()

    coordinateNode.viewZNode = viewZNode
    coordinateNode.depthNode = depthNode
    coordinateNode.sliceEndpointsNode = sliceEndpoints
    coordinateNode.camera = camera
    coordinateNode.numEpipolarSlices = numEpipolarSlices
    coordinateNode.maxSamplesInSlice = maxSamplesInSlice
    coordinateNode.screenSize = screenSize
    const coordinate = coordinateNode.getTextureNode()

    sliceUVDirectionNode.csmShadowNode = csmShadowNode
    sliceUVDirectionNode.sliceEndpointsNode = sliceEndpoints
    sliceUVDirectionNode.camera = camera
    sliceUVDirectionNode.numEpipolarSlices = numEpipolarSlices
    sliceUVDirectionNode.maxSamplesInSlice = maxSamplesInSlice
    sliceUVDirectionNode.firstCascade = firstCascade
    sliceUVDirectionNode.screenSize = screenSize
    sliceUVDirectionNode.shadowMapTexelSize = shadowMapTexelSize
    sliceUVDirectionNode.shadowCascadeArray = shadowCascadeArray
    sliceUVDirectionNode.shadowMatrixArray = shadowMatrixArray
    const sliceUVDirection = sliceUVDirectionNode.getTextureNode()

    minMaxLevelsNode.csmShadowNode = csmShadowNode
    minMaxLevelsNode.sliceUVDirectionNode = sliceUVDirection
    minMaxLevelsNode.numEpipolarSlices = numEpipolarSlices
    minMaxLevelsNode.maxSamplesInSlice = maxSamplesInSlice
    minMaxLevelsNode.firstCascade = firstCascade
    minMaxLevelsNode.shadowDepthNodes = shadowDepthNodes
    const minMaxLevels = minMaxLevelsNode.getTextureNode()

    epipolarShadowLengthNode.csmShadowNode = csmShadowNode
    epipolarShadowLengthNode.coordinateNode = coordinate
    epipolarShadowLengthNode.sliceUVDirectionNode = sliceUVDirection
    epipolarShadowLengthNode.minMaxLevelsNode = minMaxLevels
    epipolarShadowLengthNode.camera = camera
    epipolarShadowLengthNode.numEpipolarSlices = numEpipolarSlices
    epipolarShadowLengthNode.maxSamplesInSlice = maxSamplesInSlice
    epipolarShadowLengthNode.firstCascade = firstCascade
    epipolarShadowLengthNode.maxShadowStep = maxShadowStep
    epipolarShadowLengthNode.shadowCascadeArray = shadowCascadeArray
    epipolarShadowLengthNode.shadowMatrixArray = shadowMatrixArray
    epipolarShadowLengthNode.shadowDepthNodes = shadowDepthNodes
    const epipolarShadowLength = epipolarShadowLengthNode.getTextureNode()

    unwarpEpipolarNode.sliceEndpointsNode = sliceEndpoints
    unwarpEpipolarNode.coordinateNode = coordinate
    unwarpEpipolarNode.epipolarShadowLengthNode = epipolarShadowLength
    unwarpEpipolarNode.viewZNode = viewZNode
    unwarpEpipolarNode.depthNode = depthNode
    unwarpEpipolarNode.camera = camera
    unwarpEpipolarNode.numEpipolarSlices = numEpipolarSlices
    unwarpEpipolarNode.maxSamplesInSlice = maxSamplesInSlice
    unwarpEpipolarNode.screenSize = screenSize
    unwarpEpipolarNode.lightScreenPosition = lightScreenPosition
    const unwarpEpipolar = unwarpEpipolarNode.getTextureNode()

    return unwarpEpipolar
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
