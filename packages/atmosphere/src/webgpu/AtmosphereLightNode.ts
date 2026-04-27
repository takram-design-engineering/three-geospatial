import { Matrix3 } from 'three'
import type { DirectLightData, LightingContext } from 'three/src/nodes/TSL.js'
import {
  cameraViewMatrix,
  normalWorld,
  positionWorld,
  uniform,
  vec4
} from 'three/tsl'
import {
  AnalyticLightNode,
  NodeUpdateType,
  type NodeBuilder,
  type NodeFrame
} from 'three/webgpu'

import {
  getAtmosphereContext,
  type AtmosphereContext
} from './AtmosphereContext'
import type { AtmosphereLight } from './AtmosphereLight'
import { getTransmittanceToSun } from './common'
import { getIndirectIlluminance } from './runtime'

const rotationScratch = /*#__PURE__*/ new Matrix3()

export class AtmosphereLightNode extends AnalyticLightNode<AtmosphereLight> {
  static override get type(): string {
    return 'AtmosphereLightNode'
  }

  private atmosphereContext?: AtmosphereContext

  private readonly intensity = uniform(1)
  private readonly directionECEF = uniform('vec3')

  constructor(light?: AtmosphereLight | null) {
    super(light)
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore(frame: NodeFrame): void {
    const { light, atmosphereContext } = this
    if (light == null || atmosphereContext == null) {
      return
    }
    const { matrixECEFToWorld } = atmosphereContext
    light.position
      .copy(this.directionECEF.value)
      .applyMatrix3(rotationScratch.setFromMatrix4(matrixECEFToWorld.value))
      .multiplyScalar(light.distance)
      .add(light.target.position)
  }

  override update(frame: NodeFrame): void {
    super.update(frame)

    const { light, atmosphereContext } = this
    if (light == null || atmosphereContext == null) {
      return
    }
    switch (light.body) {
      case 'sun':
        this.intensity.value = light.intensity
        this.directionECEF.value.copy(atmosphereContext.sunDirectionECEF.value)
        break
      case 'moon':
        this.intensity.value = light.intensity * 2.5e-6 // TODO: Consider moon phase
        this.directionECEF.value.copy(atmosphereContext.moonDirectionECEF.value)
        break
    }
  }

  override setup(builder: NodeBuilder): unknown {
    this.atmosphereContext = getAtmosphereContext(builder)
    return super.setup(builder)
  }

  override setupDirect(builder: NodeBuilder): DirectLightData | undefined {
    const { light, atmosphereContext } = this
    if (light == null || atmosphereContext == null) {
      return
    }

    const { intensity, directionECEF } = this
    const { direct, indirect } = light
    const {
      worldToUnit,
      solarIrradiance,
      sunRadianceToLuminance,
      luminanceScale
    } = atmosphereContext.parametersNode
    const { matrixWorldToECEF, matrixECEFToWorld, altitudeCorrectionECEF } =
      atmosphereContext

    // Derive the ECEF normal vector and the unit-space position of the vertex.
    const normalECEF = matrixWorldToECEF.mul(vec4(normalWorld, 0)).xyz
    let positionECEF = matrixWorldToECEF.mul(vec4(positionWorld, 1)).xyz
    if (atmosphereContext.correctAltitude) {
      positionECEF = positionECEF.add(altitudeCorrectionECEF)
    }
    const positionUnit = positionECEF.mul(worldToUnit).toConst()

    // Compute the indirect illuminance to store it in the context.
    const indirectIlluminance = getIndirectIlluminance(
      positionUnit,
      normalECEF,
      directionECEF
    ).mul(indirect.select(1, 0))

    // Yes, it's an indirect but should be fine to update it here.
    const lightingContext = builder.context as unknown as LightingContext
    lightingContext.irradiance.addAssign(indirectIlluminance.mul(intensity))

    // Derive the view-space light direction.
    const directionWorld = matrixECEFToWorld.mul(vec4(directionECEF, 0)).xyz
    const directionView = cameraViewMatrix.mul(vec4(directionWorld, 0)).xyz

    // Compute the direct luminance of the light.
    // Fortunately, the apparent sizes of the sun and moon are close, we use
    // the result of getTransmittanceToSun for the moon as well.
    const radius = positionUnit.length().toConst()
    const cosLight = positionUnit.dot(directionECEF).div(radius)
    const transmittance = getTransmittanceToSun(
      atmosphereContext.lutNode.getTextureNode('transmittance'),
      radius,
      cosLight
    )

    const directLuminance = solarIrradiance
      .mul(transmittance)
      .mul(sunRadianceToLuminance.mul(luminanceScale))
      .mul(intensity)
      .mul(direct.select(1, 0))

    return {
      lightDirection: directionView,
      lightColor: directLuminance.mul(this.colorNode)
    }
  }
}
