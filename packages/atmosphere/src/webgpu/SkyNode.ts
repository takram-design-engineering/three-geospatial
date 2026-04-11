import type { Camera } from 'three'
import { hash } from 'three/src/nodes/core/NodeUtils.js'
import { Fn, mix, nodeProxy, positionGeometry, uv, vec3, vec4 } from 'three/tsl'
import { TempNode, type Node, type NodeBuilder } from 'three/webgpu'

import {
  equirectToDirectionWorld,
  inverseProjectionMatrix,
  inverseViewMatrix
} from '@takram/three-geospatial/webgpu'

import { getAtmosphereContext } from './AtmosphereContext'
import { MoonNode } from './MoonNode'
import { getIndirectLuminance } from './runtime'
import { StarsNode } from './StarsNode'
import { SunNode } from './SunNode'

const cameraDirectionWorld = (camera?: Camera | null): Node<'vec3'> => {
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
  moonScattering = false
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
      +this.moonScattering,
      +this.useContextCamera
    )
  }

  override setup(builder: NodeBuilder): unknown {
    const atmosphereContext = getAtmosphereContext(builder)

    const {
      matrixWorldToECEF,
      sunDirectionECEF,
      moonDirectionECEF,
      cameraPositionUnit,
      altitudeCorrectionUnit
    } = atmosphereContext

    // Direction of the camera ray:
    let directionWorld
    switch (this.scope) {
      case CAMERA: {
        directionWorld = cameraDirectionWorld(
          this.useContextCamera ? atmosphereContext.camera : null
        )
        break
      }
      case EQUIRECTANGULAR:
        directionWorld = equirectToDirectionWorld(uv())
        break
    }
    if (directionWorld == null) {
      return
    }

    return Fn(() => {
      const rayDirectionECEF = matrixWorldToECEF
        .mul(vec4(directionWorld, 0))
        .xyz.toVertexStage()
        .normalize()
        .toConst()

      const solarLuminanceTransfer = getIndirectLuminance(
        cameraPositionUnit.add(altitudeCorrectionUnit),
        rayDirectionECEF,
        this.shadowLengthNode ?? 0,
        sunDirectionECEF
      ).toConst()
      const transmittance = solarLuminanceTransfer.get('transmittance')
      let inscatter = solarLuminanceTransfer.get('luminance')

      if (this.moonScattering) {
        const lunarLuminanceTransfer = getIndirectLuminance(
          cameraPositionUnit.add(altitudeCorrectionUnit),
          rayDirectionECEF,
          this.shadowLengthNode ?? 0,
          moonDirectionECEF
        )

        // TODO: Consider moon phase
        inscatter = inscatter.add(
          lunarLuminanceTransfer.get('luminance').mul(2.5e-6)
        )
      }

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
