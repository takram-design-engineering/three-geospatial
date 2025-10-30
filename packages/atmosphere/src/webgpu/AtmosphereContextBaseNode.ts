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

function densityProfileLayerNodes(
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

function densityProfileNodes(
  profile: DensityProfile,
  worldToUnit: number
): DensityProfileNodes {
  return {
    layers: [
      densityProfileLayerNodes(profile.layers[0], worldToUnit),
      densityProfileLayerNodes(profile.layers[1], worldToUnit)
    ]
  }
}

export class AtmosphereContextBaseNode extends Node {
  static override get type(): string {
    return 'AtmosphereContextBaseNode'
  }

  readonly parameters: AtmosphereParameters

  worldToUnit: NodeObject<Dimensionless>
  solarIrradiance: NodeObject<IrradianceSpectrum>
  sunAngularRadius: NodeObject<Angle>
  bottomRadius: NodeObject<Length>
  topRadius: NodeObject<Length>
  rayleighDensity: DensityProfileNodes
  rayleighScattering: NodeObject<ScatteringSpectrum>
  mieDensity: DensityProfileNodes
  mieScattering: NodeObject<ScatteringSpectrum>
  mieExtinction: NodeObject<ScatteringSpectrum>
  miePhaseFunctionG: NodeObject<Dimensionless>
  absorptionDensity: DensityProfileNodes
  absorptionExtinction: NodeObject<ScatteringSpectrum>
  groundAlbedo: NodeObject<DimensionlessSpectrum>
  minCosSun: NodeObject<Dimensionless>
  sunRadianceToLuminance: NodeObject<DimensionlessSpectrum>
  skyRadianceToLuminance: NodeObject<DimensionlessSpectrum>
  luminanceScale: NodeObject<Dimensionless>

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
    this.worldToUnit = float(worldToUnit)
    this.solarIrradiance = vec3(solarIrradiance)
    this.sunAngularRadius = float(sunAngularRadius)
    this.bottomRadius = float(bottomRadius * worldToUnit)
    this.topRadius = float(topRadius * worldToUnit)
    this.rayleighDensity = densityProfileNodes(rayleighDensity, worldToUnit)
    this.rayleighScattering = vec3(
      rayleighScattering.x / worldToUnit,
      rayleighScattering.y / worldToUnit,
      rayleighScattering.z / worldToUnit
    )
    this.mieDensity = densityProfileNodes(mieDensity, worldToUnit)
    this.mieScattering = vec3(
      mieScattering.x / worldToUnit,
      mieScattering.y / worldToUnit,
      mieScattering.z / worldToUnit
    )
    this.mieExtinction = vec3(
      mieExtinction.x / worldToUnit,
      mieExtinction.y / worldToUnit,
      mieExtinction.z / worldToUnit
    )
    this.miePhaseFunctionG = float(miePhaseFunctionG)
    this.absorptionDensity = densityProfileNodes(absorptionDensity, worldToUnit)
    this.absorptionExtinction = vec3(
      absorptionExtinction.x / worldToUnit,
      absorptionExtinction.y / worldToUnit,
      absorptionExtinction.z / worldToUnit
    )
    this.groundAlbedo = vec3(groundAlbedo)
    this.minCosSun = float(minCosSun)
    this.sunRadianceToLuminance = vec3(sunRadianceToLuminance)
    this.skyRadianceToLuminance = vec3(skyRadianceToLuminance)
    this.luminanceScale = float(luminanceScale)
  }

  override customCacheKey(): number {
    return this.parameters.hash()
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
