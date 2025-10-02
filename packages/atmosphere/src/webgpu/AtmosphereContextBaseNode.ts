import { float, vec3 } from 'three/tsl'
import { Node, type NodeBuilder } from 'three/webgpu'

import type { NodeObject } from '@takram/three-geospatial/webgpu'

import {
  AtmosphereParameters,
  type DensityProfile,
  type DensityProfileLayer
} from './AtmosphereParameters'
import type {
  Angle,
  Dimensionless,
  DimensionlessSpectrum,
  InverseLength,
  IrradianceSpectrum,
  Length,
  ScatteringSpectrum
} from './dimensional'

export interface DensityProfileLayerNodes {
  width: NodeObject<Length>
  expTerm: NodeObject<Dimensionless>
  expScale: NodeObject<InverseLength>
  linearTerm: NodeObject<InverseLength>
  constantTerm: NodeObject<Dimensionless>
}

function createDensityProfileLayerNodes(
  layer: DensityProfileLayer,
  worldToUnit: number
): DensityProfileLayerNodes {
  const { width, expTerm, expScale, linearTerm, constantTerm } = layer

  // BUG: Invoking toVar() or toConst() on these nodes breaks shaders.
  return {
    width: float(width * worldToUnit),
    expTerm: float(expTerm),
    expScale: float(expScale / worldToUnit),
    linearTerm: float(linearTerm / worldToUnit),
    constantTerm: float(constantTerm)
  }
}

export interface DensityProfileNodes {
  layers: [DensityProfileLayerNodes, DensityProfileLayerNodes]
}

function createDensityProfileNodes(
  profile: DensityProfile,
  worldToUnit: number
): DensityProfileNodes {
  return {
    layers: [
      createDensityProfileLayerNodes(profile.layers[0], worldToUnit),
      createDensityProfileLayerNodes(profile.layers[1], worldToUnit)
    ]
  }
}

export class AtmosphereContextBaseNode extends Node {
  static override get type(): string {
    return 'AtmosphereContextBaseNode'
  }

  readonly parameters: AtmosphereParameters

  worldToUnit!: NodeObject<Dimensionless>
  solarIrradiance!: NodeObject<IrradianceSpectrum>
  sunAngularRadius!: NodeObject<Angle>
  bottomRadius!: NodeObject<Length>
  topRadius!: NodeObject<Length>
  rayleighDensity!: DensityProfileNodes
  rayleighScattering!: NodeObject<ScatteringSpectrum>
  mieDensity!: DensityProfileNodes
  mieScattering!: NodeObject<ScatteringSpectrum>
  mieExtinction!: NodeObject<ScatteringSpectrum>
  miePhaseFunctionG!: NodeObject<Dimensionless>
  absorptionDensity!: DensityProfileNodes
  absorptionExtinction!: NodeObject<ScatteringSpectrum>
  groundAlbedo!: NodeObject<DimensionlessSpectrum>
  minCosSun!: NodeObject<Dimensionless>
  sunRadianceToLuminance!: NodeObject<DimensionlessSpectrum>
  skyRadianceToLuminance!: NodeObject<DimensionlessSpectrum>
  luminanceScale!: NodeObject<Dimensionless>

  constructor(parameters = new AtmosphereParameters()) {
    super(null)
    this.parameters = parameters

    const {
      worldToUnit,
      solarIrradiance,
      sunAngularRadius,
      bottomRadius,
      topRadius,
      rayleighDensity,
      rayleighScattering,
      mieDensity,
      mieScattering,
      mieExtinction,
      miePhaseFunctionG,
      absorptionDensity,
      absorptionExtinction,
      groundAlbedo,
      minCosSun,
      sunRadianceToLuminance,
      skyRadianceToLuminance,
      luminanceScale
    } = parameters

    // BUG: Invoking toVar() or toConst() on these nodes breaks shaders.
    // prettier-ignore
    Object.assign(this, {
      worldToUnit: float(worldToUnit),
      solarIrradiance: vec3(solarIrradiance),
      sunAngularRadius: float(sunAngularRadius),
      bottomRadius: float(bottomRadius * worldToUnit),
      topRadius: float(topRadius * worldToUnit),
      rayleighDensity: createDensityProfileNodes(rayleighDensity, worldToUnit),
      rayleighScattering: vec3(rayleighScattering.clone().divideScalar(worldToUnit)),
      mieDensity: createDensityProfileNodes(mieDensity, worldToUnit),
      mieScattering: vec3(mieScattering.clone().divideScalar(worldToUnit)),
      mieExtinction: vec3(mieExtinction.clone().divideScalar(worldToUnit)),
      miePhaseFunctionG: float(miePhaseFunctionG),
      absorptionDensity: createDensityProfileNodes(absorptionDensity, worldToUnit),
      absorptionExtinction: vec3(absorptionExtinction.clone().divideScalar(worldToUnit)),
      groundAlbedo: vec3(groundAlbedo),
      minCosSun: float(minCosSun),
      sunRadianceToLuminance: vec3(sunRadianceToLuminance),
      skyRadianceToLuminance: vec3(skyRadianceToLuminance),
      luminanceScale: float(luminanceScale)
    })
  }

  static get(builder: NodeBuilder): AtmosphereContextBaseNode {
    const context = builder.getContext().atmosphere
    if (!(context instanceof AtmosphereContextBaseNode)) {
      throw new Error(
        'AtmosphereContextBaseNode was not found in the builder context.'
      )
    }
    return context
  }
}
