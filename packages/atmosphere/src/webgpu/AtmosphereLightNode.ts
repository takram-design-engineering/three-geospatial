import { Matrix4, Vector3, type Camera } from 'three'
import type { LightingContext } from 'three/src/nodes/TSL.js'
import {
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
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'
import invariant from 'tiny-invariant'

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

  override setup(builder: NodeBuilder): void {
    // Intentionally omit the call of super.

    const light = this.light
    const lutNode = light?.lutNode
    if (light == null || lutNode == null) {
      return
    }

    const ecefToWorldMatrix = uniform(new Matrix4().identity()).onRenderUpdate(
      (_, self) => {
        self.value.copy(light.worldToECEFMatrix).invert()
      }
    )

    // The cameraPosition node doesn't seem to work with post-processing.
    const camera = (builder as NodeBuilder & { camera?: Camera }).camera
    invariant(camera != null)
    const altitudeCorrectionECEF = uniform(new Vector3()).onRenderUpdate(
      (_, self) => {
        getAltitudeCorrectionOffset(
          self.value
            .setFromMatrixPosition(camera.matrixWorld)
            .applyMatrix4(light.worldToECEFMatrix),
          lutNode.parameters.bottomRadius,
          light.ellipsoid,
          self.value
        )
      }
    )

    // Uniforms derived from the light properties:
    const { worldToECEFMatrix, sunDirectionECEF } = this

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
