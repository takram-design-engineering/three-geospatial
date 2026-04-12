import {
  CubeCamera,
  WebGLCubeRenderTarget as CubeRenderTarget,
  HalfFloatType,
  Mesh,
  RGBAFormat,
  Vector3
} from 'three'
import { pmremTexture, positionGeometry, vec4 } from 'three/tsl'
import {
  NodeMaterial,
  NodeUpdateType,
  TempNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import { QuadGeometry, radians } from '@takram/three-geospatial'
import { OnBeforeFrameUpdate } from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import { sky, type SkyNode } from './SkyNode'

export class SkyEnvironmentNode extends TempNode<'vec3'> {
  static get type(): string {
    return 'SkyEnvironmentNode'
  }

  skyNode: SkyNode

  distanceThreshold = 100
  angularThreshold = radians(0.1)

  private readonly renderTarget: CubeRenderTarget
  private readonly cubeCamera: CubeCamera
  private readonly material = new NodeMaterial()
  private readonly mesh = new Mesh(new QuadGeometry(), this.material)

  private currentVersion?: number
  private removeLUTUpdateListener?: () => void

  constructor(size = 64) {
    super('vec3')

    this.skyNode = sky()
    this.skyNode.showSun = false
    this.skyNode.showMoon = false
    this.skyNode.showStars = false
    this.skyNode.useContextCamera = false

    this.renderTarget = new CubeRenderTarget(size, {
      depthBuffer: false,
      type: HalfFloatType,
      format: RGBAFormat
    })
    this.cubeCamera = new CubeCamera(0.1, 1000, this.renderTarget)

    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore({ renderer }: NodeFrame): boolean | undefined {
    if (renderer == null || this.version === this.currentVersion) {
      return
    }
    this.currentVersion = this.version
    this.cubeCamera.update(renderer, this.mesh)
  }

  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
  override setup(builder: NodeBuilder) {
    const context = getAtmosphereContext(builder)

    const { camera } = context
    if (camera != null) {
      const nextPosition = new Vector3()
      const prevPosition = new Vector3()
      OnBeforeFrameUpdate(() => {
        // TODO: Ideally, this should be compared against the parameterization
        // values of the LUT. (i.e. radius, angle between view and sun, etc.)
        nextPosition
          .copy(camera.position)
          .divideScalar(this.distanceThreshold)
          .round()
        if (!prevPosition.equals(nextPosition)) {
          prevPosition.copy(nextPosition)
          this.needsUpdate = true
        }
      })
    }

    const sunDirection = context.sunDirectionECEF.value.clone()
    OnBeforeFrameUpdate(() => {
      const { value } = context.sunDirectionECEF
      if (sunDirection.angleTo(value) > this.angularThreshold) {
        sunDirection.copy(value)
        this.needsUpdate = true
      }
    })

    const moonDirection = context.moonDirectionECEF.value.clone()
    OnBeforeFrameUpdate(() => {
      const { value } = context.moonDirectionECEF
      if (moonDirection.angleTo(value) > this.angularThreshold) {
        moonDirection.copy(value)
        this.needsUpdate = true
      }
    })

    const handleLUTUpdate = (): void => {
      this.needsUpdate = true
    }
    context.lutNode.addEventListener(
      // @ts-expect-error Cannot specify the events map
      'update',
      handleLUTUpdate
    )
    this.removeLUTUpdateListener?.()
    this.removeLUTUpdateListener = () => {
      context.lutNode.removeEventListener(
        // @ts-expect-error Cannot specify the events map
        'update',
        handleLUTUpdate
      )
    }

    this.material.vertexNode = vec4(positionGeometry.xy, 0, 1)
    this.material.fragmentNode = this.skyNode
    return pmremTexture(this.renderTarget.texture)
  }

  override dispose(): void {
    this.removeLUTUpdateListener?.()

    this.renderTarget.dispose()
    this.skyNode.dispose() // TODO: Conditionally depending on the owner.
    this.material.dispose()
    this.mesh.geometry.dispose()
    super.dispose()
  }
}

export const skyEnvironment = (
  ...args: ConstructorParameters<typeof SkyEnvironmentNode>
): SkyEnvironmentNode => new SkyEnvironmentNode(...args)
