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

import { getAtmosphereContext } from './AtmosphereContext'
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

  shadowLengthNode?: Node<'float'> | null

  sunNode: SunNode
  moonNode: MoonNode
  starsNode: StarsNode

  showSun = true
  showMoon = true
  showStars = true
  useContextCamera = true

  constructor(scope: SkyNodeScope) {
    super('vec3')
    this.scope = scope
    this.sunNode = new SunNode()
    this.moonNode = new MoonNode()
    this.starsNode = new StarsNode()
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
    const atmosphereContext = getAtmosphereContext(builder)

    const {
      matrixWorldToECEF,
      sunDirectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit
    } = atmosphereContext

    // Direction of the camera ray:
    let directionWorld
    switch (this.scope) {
      case CAMERA: {
        const camera = this.useContextCamera
          ? atmosphereContext.camera
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
