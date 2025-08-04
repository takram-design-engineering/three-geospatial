import type { LightingContext } from 'three/src/nodes/TSL.js'
import { cameraViewMatrix, normalWorld, positionWorld, vec4 } from 'three/tsl'
import {
  AnalyticLightNode,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import type { Node, NodeObject } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLight } from './AtmosphereLight'
import { getTransmittanceToSun } from './common'
import { getSkyIlluminance } from './runtime'

type CorrectLightingContext = {
  [K in keyof LightingContext]: LightingContext[K] extends Node
    ? NodeObject<LightingContext[K]>
    : LightingContext[K]
}

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }

  interface NodeBuilder {
    context: CorrectLightingContext
  }
}

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  static override get type(): string {
    return 'AtmosphereLightNode'
  }

  override setup(builder: NodeBuilder): void {
    // Intentionally omit the call to super.

    const { renderingContext, lutNode } = this.light ?? {}
    if (renderingContext == null || lutNode == null) {
      return
    }

    const {
      worldToECEFMatrix,
      ecefToWorldMatrix,
      sunDirectionECEF,
      altitudeCorrectionECEF
    } = renderingContext.getNodes()

    // Parameters defined in the LUT:
    const parameters = lutNode.parameters.getNodes()
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
      lutNode,
      positionUnit,
      normalECEF,
      sunDirectionECEF
    )
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

    // Setup a direct light in the lighting model.
    builder.lightsNode.setupDirectLight(builder, this, {
      lightDirection: sunDirectionView,
      lightColor: sunLuminance
    })
  }
}
