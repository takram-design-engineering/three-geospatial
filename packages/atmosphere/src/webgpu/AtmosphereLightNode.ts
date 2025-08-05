import type { DirectLightData, LightingContext } from 'three/src/nodes/TSL.js'
import {
  cameraViewMatrix,
  normalWorld,
  positionWorld,
  select,
  vec4
} from 'three/tsl'
import {
  AnalyticLightNode,
  type Light,
  type LightingNode,
  type NodeBuilder
} from 'three/webgpu'

import { referenceTo, type NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLight } from './AtmosphereLight'
import { getTransmittanceToSun } from './common'
import { getSkyIlluminance } from './runtime'

declare module 'three/webgpu' {
  interface NodeBuilder {
    context: {
      [K in keyof LightingContext]: LightingContext[K] extends Node
        ? NodeObject<LightingContext[K]>
        : LightingContext[K]
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface AnalyticLightNode<T extends Light> extends LightingNode {
    colorNode: Node
  }
}

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  static override get type(): string {
    return 'AtmosphereLightNode'
  }

  override setupDirect(builder: NodeBuilder): DirectLightData | undefined {
    // Intentionally omit the call to super.

    if (this.light == null) {
      return
    }
    const { renderingContext, lutNode } = this.light
    if (renderingContext == null || lutNode == null) {
      return
    }

    const reference = referenceTo(this.light)
    const direct = reference('direct')
    const indirect = reference('indirect')

    const {
      worldToECEFMatrix,
      ecefToWorldMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF
    } = renderingContext.getNodes()

    const parameters = renderingContext.parameters.getNodes()
    const {
      worldToUnit,
      solarIrradiance,
      sunRadianceToLuminance,
      luminanceScale
    } = parameters

    // Derive the ECEF normal vector and the unit-space position of the vertex.
    const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz
    let positionECEF = worldToECEFMatrix.mul(vec4(positionWorld, 1)).xyz
    if (renderingContext.correctAltitude) {
      positionECEF = positionECEF.add(altitudeCorrectionECEF)
    }
    const positionUnit = positionECEF.mul(worldToUnit).toVar()

    // Compute the indirect illuminance to store it in the context.
    const skyIlluminance = getSkyIlluminance(
      parameters,
      lutNode,
      positionUnit,
      normalECEF,
      sunDirectionECEF
    ).mul(select(indirect, 1, 0))

    // Yes, it's an indirect but should be fine to update it here.
    builder.context.irradiance.addAssign(skyIlluminance)

    // Derive the view-space sun direction.
    const sunDirectionWorld = ecefToWorldMatrix.mul(
      vec4(sunDirectionECEF, 0)
    ).xyz
    const sunDirectionView = cameraViewMatrix.mul(
      vec4(sunDirectionWorld, 0)
    ).xyz

    // Compute the direct luminance of the sun.
    const radius = positionUnit.length().toVar()
    const cosSun = positionUnit.dot(sunDirectionECEF).div(radius)
    const sunTransmittance = getTransmittanceToSun(
      parameters,
      lutNode.getTextureNode('transmittance'),
      radius,
      cosSun
    )

    const sunLuminance = solarIrradiance
      .mul(sunTransmittance)
      .mul(sunRadianceToLuminance.mul(luminanceScale))
      .mul(select(direct, 1, 0))

    // WORKAROUND: As of r178, the lightColor in the DirectLightData must
    // depends on the colorNode of AnalyticLight, otherwise the shadow camera
    // doesn't follow the direction of the light.
    this.colorNode = sunLuminance.mul(this.colorNode)

    return {
      lightDirection: sunDirectionView,
      lightColor: this.colorNode
    }
  }
}
