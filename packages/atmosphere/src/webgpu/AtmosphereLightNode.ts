import { Matrix3 } from 'three'
import type { DirectLightData, LightingContext } from 'three/src/nodes/TSL.js'
import { normalView, positionView, renderGroup, uniform, vec4 } from 'three/tsl'
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

  private readonly intensity = uniform(1).setGroup(renderGroup)
  private readonly directionECEF = uniform('vec3').setGroup(renderGroup)

  constructor(light?: AtmosphereLight | null) {
    super(light)
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore(frame: NodeFrame): void {
    const { light, atmosphereContext } = this
    if (light == null || atmosphereContext == null) {
      return
    }
    const { matrixWorldToECEF } = atmosphereContext
    light.position
      .copy(this.directionECEF.value)
      .applyMatrix3(
        // WORKAROUND: We cannot use matrixECEFToWorld here because nothing uses
        // it in the node graph, therefore it is not updated.
        rotationScratch.setFromMatrix4(matrixWorldToECEF.value).transpose()
      )
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
    const { matrixViewToECEF, matrixECEFToView, altitudeCorrectionECEF } =
      atmosphereContext

    // Derive the ECEF normal vector and the unit-space position of the vertex.
    const normalECEF = matrixViewToECEF.mul(vec4(normalView, 0)).xyz
    let positionECEF = matrixViewToECEF.mul(vec4(positionView, 1)).xyz
    if (atmosphereContext.correctAltitude) {
      positionECEF = positionECEF.add(altitudeCorrectionECEF)
    }
    const positionUnit = positionECEF.mul(worldToUnit).toConst()

    // Compute the indirect illuminance to store it in the context.
    const indirectIlluminance = getIndirectIlluminance(
      positionUnit,
      normalECEF,
      directionECEF
    ).mul(indirect.select(1, 0).uniformFlow())

    // Yes, it's an indirect but should be fine to update it here.
    const lightingContext = builder.context as unknown as LightingContext
    lightingContext.irradiance.addAssign(indirectIlluminance.mul(intensity))

    // Derive the view-space light direction.
    const directionView = matrixECEFToView.mul(vec4(directionECEF, 0)).xyz

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
      .mul(direct.select(1, 0).uniformFlow())

    return {
      lightDirection: directionView,
      lightColor: directLuminance.mul(this.colorNode)
    }
  }
}
