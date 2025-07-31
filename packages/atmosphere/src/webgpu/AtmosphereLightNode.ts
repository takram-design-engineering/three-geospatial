import type { LightingContext } from 'three/src/nodes/TSL.js'
import {
  cameraPosition,
  cameraViewMatrix,
  length,
  normalWorld,
  positionWorld,
  reference,
  uniform,
  vec4
} from 'three/tsl'
import {
  AnalyticLightNode,
  Matrix4,
  Vector3,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import { assertType } from '@takram/three-geospatial'
import type { Node, NodeObject } from '@takram/three-geospatial/webgpu'

import { getAltitudeCorrectionOffset } from '../getAltitudeCorrectionOffset'
import type { AtmosphereLight } from './AtmosphereLight'
import { getTransmittanceToSun } from './common'
import { getSkyIlluminance } from './runtime'

declare module 'three/webgpu' {
  interface Node {
    onRenderUpdate(
      callback: (this: this, frame: NodeFrame, self: this) => void
    ): this
  }
}

type CorrectLightingContext = {
  [K in keyof LightingContext]: LightingContext[K] extends Node
    ? NodeObject<LightingContext[K]>
    : LightingContext[K]
}

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  static override get type(): string {
    return 'AtmosphereLightNode'
  }

  private readonly worldToECEFMatrix = reference(
    'light.worldToECEFMatrix',
    'mat4',
    this
  )
  private readonly sunDirectionECEF = reference(
    'light.sunDirectionECEF',
    'vec3',
    this
  )
  private readonly ecefToWorldMatrix = uniform(new Matrix4().identity())
  private readonly altitudeCorrectionECEF = uniform(new Vector3())

  override update(): void {
    // Intentionally omit the call of super.

    const light = this.light
    const lutNode = light?.lutNode
    if (light == null || lutNode == null) {
      return
    }

    const { ecefToWorldMatrix, altitudeCorrectionECEF } = this

    ecefToWorldMatrix.value.copy(light.worldToECEFMatrix).invert()

    getAltitudeCorrectionOffset(
      altitudeCorrectionECEF.value
        .copy(cameraPosition.value)
        .applyMatrix4(light.worldToECEFMatrix),
      lutNode.parameters.bottomRadius,
      light.ellipsoid,
      altitudeCorrectionECEF.value
    )
  }

  override setup(builder: NodeBuilder): void {
    // Intentionally omit the call of super.

    const light = this.light
    const lutNode = light?.lutNode
    if (light == null || lutNode == null) {
      return
    }

    // Uniforms derived from the light properties:
    const {
      worldToECEFMatrix,
      ecefToWorldMatrix,
      altitudeCorrectionECEF,
      sunDirectionECEF
    } = this

    // Parameters defined in the LUT:
    const parameters = lutNode.parameters.getContext()
    const {
      worldToUnit,
      solarIrradiance,
      sunRadianceToLuminance,
      luminanceScale
    } = parameters

    // Derive the ECEF normal vector and the unit-space position of the vertex.
    const normalECEF = worldToECEFMatrix.mul(vec4(normalWorld, 0)).xyz
    const positionECEF = worldToECEFMatrix
      .mul(vec4(positionWorld, 1))
      .xyz.toVar()
    if (light.correctAltitude) {
      positionECEF.addAssign(altitudeCorrectionECEF)
    }
    const positionUnit = positionECEF.mul(worldToUnit).toVar()

    // Compute the indirect illuminance to store it in the context.
    const skyIlluminance = getSkyIlluminance(
      lutNode,
      positionUnit,
      normalECEF,
      sunDirectionECEF
    )
    assertType<NodeBuilder & { context: CorrectLightingContext }>(builder)
    builder.context.irradiance.addAssign(skyIlluminance)

    // Derive the view-space sun direction.
    const sunDirectionWorld = ecefToWorldMatrix.mul(
      vec4(sunDirectionECEF, 0)
    ).xyz
    const sunDirectionView = cameraViewMatrix.mul(
      vec4(sunDirectionWorld, 0)
    ).xyz

    // Compute the direct luminance of the sun.
    const radius = length(positionUnit).toVar()
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
