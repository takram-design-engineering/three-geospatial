import type { Camera } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { Fn, mix, nodeProxy, positionGeometry, uv, vec3, vec4 } from 'three/tsl'
import { TempNode, type NodeBuilder } from 'three/webgpu'

import {
  equirectToDirectionWorld,
  inverseProjectionMatrix,
  inverseViewMatrix,
  type Node
} from '@takram/three-geospatial/webgpu'

import type { AtmosphereContextNode } from './AtmosphereContextNode'
import { MoonNode } from './MoonNode'
import { getSkyLuminance } from './runtime'
import { StarsNode } from './StarsNode'
import { SunNode } from './SunNode'

const cameraDirectionWorld = (camera: Camera): Node<'vec3'> => {
  const positionView = inverseProjectionMatrix(camera).mul(
    vec4(positionGeometry, 1)
  ).xyz
  const directionWorld = inverseViewMatrix(camera).mul(
    vec4(positionView, 0)
  ).xyz
  return directionWorld
}

const CAMERA = 'CAMERA'
const EQUIRECTANGULAR = 'EQUIRECTANGULAR'

type SkyNodeScope = typeof CAMERA | typeof EQUIRECTANGULAR

export class SkyNode extends TempNode {
  static override get type(): string {
    return 'SkyNode'
  }

  private readonly scope: SkyNodeScope = CAMERA
  private readonly atmosphereContext: AtmosphereContextNode

  shadowLengthNode?: Node<'float'> | null

  sunNode: SunNode
  moonNode: MoonNode
  starsNode: StarsNode

  // Static options:
  showSun = true
  showMoon = true
  showStars = true
  useContextCamera = true

  constructor(scope: SkyNodeScope, atmosphereContext: AtmosphereContextNode) {
    super('vec3')
    this.scope = scope
    this.atmosphereContext = atmosphereContext
    this.sunNode = new SunNode(atmosphereContext)
    this.moonNode = new MoonNode(atmosphereContext)
    this.starsNode = new StarsNode(atmosphereContext)
  }

  override customCacheKey(): number {
    return hash(
      +this.showSun,
      +this.showMoon,
      +this.showStars,
      +this.useContextCamera
    )
  }

  override setup(builder: NodeBuilder): unknown {
    builder.getContext().atmosphere = this.atmosphereContext

    const {
      matrixWorldToECEF,
      sunDirectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit
    } = this.atmosphereContext

    // Direction of the camera ray:
    let directionWorld
    switch (this.scope) {
      case CAMERA: {
        const camera = this.useContextCamera
          ? this.atmosphereContext.camera
          : builder.camera
        directionWorld =
          camera != null ? cameraDirectionWorld(camera) : undefined
        break
      }
      case EQUIRECTANGULAR:
        directionWorld = equirectToDirectionWorld(uv())
        break
    }
    if (directionWorld == null) {
      return
    }
    const rayDirectionECEF = matrixWorldToECEF
      .mul(vec4(directionWorld, 0))
      .xyz.toVertexStage()
      .normalize()

    const luminanceTransfer = getSkyLuminance(
      cameraPositionUnit.add(altitudeCorrectionUnit),
      rayDirectionECEF,
      this.shadowLengthNode ?? 0,
      sunDirectionECEF
    )
    const inscatter = luminanceTransfer.get('luminance')
    const transmittance = luminanceTransfer.get('transmittance')

    return Fn(() => {
      const luminance = vec3(0).toVar()

      if (this.showStars) {
        luminance.addAssign(this.starsNode)
      }

      if (this.showSun) {
        const { sunNode } = this
        sunNode.rayDirectionECEF = rayDirectionECEF
        luminance.assign(mix(luminance, sunNode.rgb, sunNode.a))
      }

      if (this.showMoon) {
        const { moonNode } = this
        moonNode.rayDirectionECEF = rayDirectionECEF
        luminance.assign(mix(luminance, moonNode.rgb, moonNode.a))
      }

      return luminance.mul(transmittance).add(inscatter)
    })()
  }
}

export const sky = nodeProxy(SkyNode, CAMERA)
export const skyBackground = nodeProxy(SkyNode, EQUIRECTANGULAR)
