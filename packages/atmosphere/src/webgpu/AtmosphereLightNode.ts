import type { DirectLightData, LightingContext } from 'three/src/nodes/TSL.js'
import {
  cameraViewMatrix,
  Fn,
  normalWorld,
  positionWorld,
  select,
  vec4
} from 'three/tsl'
import { AnalyticLightNode, type NodeBuilder } from 'three/webgpu'

import type { AtmosphereLight } from './AtmosphereLight'
import { getTransmittanceToSun } from './common'
import { getSkyIlluminance } from './runtime'

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  static override get type(): string {
    return 'AtmosphereLightNode'
  }

  override setupDirect(builder: NodeBuilder): DirectLightData | undefined {
    if (this.light == null) {
      return
    }
    const { atmosphereContext } = this.light
    if (atmosphereContext == null) {
      return
    }

    const { direct, indirect } = this.light

    const {
      worldToUnit,
      solarIrradiance,
      sunRadianceToLuminance,
      luminanceScale,
      matrixWorldToECEF,
      matrixECEFToWorld,
      sunDirectionECEF,
      altitudeCorrectionECEF
    } = atmosphereContext

    // Derive the ECEF normal vector and the unit-space position of the vertex.
    const normalECEF = matrixWorldToECEF.mul(vec4(normalWorld, 0)).xyz
    let positionECEF = matrixWorldToECEF.mul(vec4(positionWorld, 1)).xyz
    if (atmosphereContext.correctAltitude) {
      positionECEF = positionECEF.add(altitudeCorrectionECEF)
    }
    const positionUnit = positionECEF.mul(worldToUnit).toVar()

    // Compute the indirect illuminance to store it in the context.
    const skyIlluminance = Fn(builder => {
      // WORKAROUND: The builder in MeshBasicNodeMaterial is different from that
      // provided to the setupDirect().
      builder.getContext().atmosphere = atmosphereContext
      return getSkyIlluminance(positionUnit, normalECEF, sunDirectionECEF).mul(
        select(indirect, 1, 0)
      )
    })()

    // Yes, it's an indirect but should be fine to update it here.
    const lightingContext = builder.getContext() as unknown as LightingContext
    lightingContext.irradiance.addAssign(skyIlluminance)

    // Derive the view-space sun direction.
    const sunDirectionWorld = matrixECEFToWorld.mul(
      vec4(sunDirectionECEF, 0)
    ).xyz
    const sunDirectionView = cameraViewMatrix.mul(
      vec4(sunDirectionWorld, 0)
    ).xyz

    // Compute the direct luminance of the sun.
    const radius = positionUnit.length().toVar()
    const cosSun = positionUnit.dot(sunDirectionECEF).div(radius)
    const sunTransmittance = Fn(builder => {
      // WORKAROUND: The builder in MeshBasicNodeMaterial is different from that
      // provided to the setupDirect().
      builder.getContext().atmosphere = atmosphereContext
      return getTransmittanceToSun(
        atmosphereContext.lutNode.getTextureNode('transmittance'),
        radius,
        cosSun
      )
    })()

    const sunLuminance = solarIrradiance
      .mul(sunTransmittance)
      .mul(sunRadianceToLuminance.mul(luminanceScale))
      .mul(select(direct, 1, 0))

    return {
      lightDirection: sunDirectionView,
      lightColor: sunLuminance.mul(this.colorNode)
    }
  }
}
