import { float, ivec2, struct, uint, uvec2, vec3 } from 'three/tsl'
import type { NodeBuilder, StructNode } from 'three/webgpu'

import { reinterpretType } from '@takram/three-geospatial'
import type { Node, NodeType } from '@takram/three-geospatial/webgpu'

import type {
  AtmosphereParameters,
  DensityProfile,
  DensityProfileLayer
} from './AtmosphereParameters'
import {
  Angle,
  Dimensionless,
  DimensionlessSpectrum,
  InverseLength,
  IrradianceSpectrum,
  Length,
  ScatteringSpectrum
} from './dimensional'

export const densityProfileLayerStruct = /*#__PURE__*/ struct(
  {
    width: Length,
    expTerm: Dimensionless,
    expScale: InverseLength,
    linearTerm: InverseLength,
    constantTerm: Dimensionless
  },
  'DensityProfileLayer'
)

export const densityProfileStruct = /*#__PURE__*/ struct(
  {
    layer0: densityProfileLayerStruct.layout.name!,
    layer1: densityProfileLayerStruct.layout.name!
  },
  'DensityProfile'
)

const atmosphereParametersLayout = {
  worldToUnit: Dimensionless,
  solarIrradiance: IrradianceSpectrum,
  sunAngularRadius: Angle,
  bottomRadius: Length,
  topRadius: Length,
  rayleighDensity: densityProfileStruct.layout.name!,
  rayleighScattering: ScatteringSpectrum,
  mieDensity: densityProfileStruct.layout.name!,
  mieScattering: ScatteringSpectrum,
  mieExtinction: ScatteringSpectrum,
  miePhaseFunctionG: Dimensionless,
  absorptionDensity: densityProfileStruct.layout.name!,
  absorptionExtinction: ScatteringSpectrum,
  groundAlbedo: DimensionlessSpectrum,
  minCosLight: Dimensionless,
  sunRadianceToLuminance: DimensionlessSpectrum,
  skyRadianceToLuminance: DimensionlessSpectrum,
  luminanceScale: Dimensionless,
  transmittanceTextureSize: 'uvec2',
  irradianceTextureSize: 'uvec2',
  multipleScatteringTextureSize: 'uvec2',
  scatteringTextureRadiusSize: 'uint',
  scatteringTextureCosViewSize: 'uint',
  scatteringTextureCosLightSize: 'uint',
  scatteringTextureCosViewLightSize: 'uint'
} satisfies Partial<Record<keyof AtmosphereParameters, unknown>>

export const atmosphereParametersStruct = /*#__PURE__*/ struct(
  atmosphereParametersLayout,
  'AtmosphereParameters'
)

function densityProfileLayer(
  layer: DensityProfileLayer,
  worldToUnit: number
): StructNode {
  const { width, expTerm, expScale, linearTerm, constantTerm } = layer
  return densityProfileLayerStruct({
    // @ts-expect-error Object-style parameter is supported
    width: float(width * worldToUnit),
    expTerm: float(expTerm),
    expScale: float(expScale / worldToUnit),
    linearTerm: float(linearTerm / worldToUnit),
    constantTerm: float(constantTerm)
  })
}

function densityProfile(
  profile: DensityProfile,
  worldToUnit: number
): StructNode {
  return densityProfileStruct({
    // @ts-expect-error Object-style parameter is supported
    layer0: densityProfileLayer(profile.layers[0], worldToUnit),
    layer1: densityProfileLayer(profile.layers[1], worldToUnit)
  })
}

type AtmosphereParametersFields = {
  [K in keyof typeof atmosphereParametersLayout]: (typeof atmosphereParametersLayout)[K] extends NodeType
    ? Node<(typeof atmosphereParametersLayout)[K]>
    : Node
}

const DESTRUCTIBLE = Symbol('DESTRUCTIBLE')

export function makeDestructible(
  node: Node
): Node & AtmosphereParametersFields {
  reinterpretType<
    StructNode &
      AtmosphereParametersFields & {
        [DESTRUCTIBLE]?: boolean
      }
  >(node)
  if (node[DESTRUCTIBLE] === true) {
    return node
  }
  for (const key in atmosphereParametersLayout) {
    if (Object.hasOwn(atmosphereParametersLayout, key)) {
      node[key as keyof typeof atmosphereParametersLayout] = node.get(key)
    }
  }
  node[DESTRUCTIBLE] = true
  return node
}

export class AtmosphereContextBase {
  readonly parameters: AtmosphereParameters
  readonly parametersNode: Node & AtmosphereParametersFields

  constructor(parameters: AtmosphereParameters) {
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
      minCosLight,
      sunRadianceToLuminance,
      skyRadianceToLuminance,
      luminanceScale,
      transmittanceTextureSize,
      irradianceTextureSize,
      multipleScatteringTextureSize,
      scatteringTextureRadiusSize,
      scatteringTextureCosViewSize,
      scatteringTextureCosLightSize,
      scatteringTextureCosViewLightSize
    } = parameters

    this.parametersNode = makeDestructible(
      atmosphereParametersStruct({
        // @ts-expect-error Object-style parameter is supported
        worldToUnit: float(worldToUnit),
        solarIrradiance: vec3(solarIrradiance),
        sunAngularRadius: float(sunAngularRadius),
        bottomRadius: float(bottomRadius * worldToUnit),
        topRadius: float(topRadius * worldToUnit),
        rayleighDensity: densityProfile(rayleighDensity, worldToUnit),
        rayleighScattering: vec3(
          rayleighScattering.x / worldToUnit,
          rayleighScattering.y / worldToUnit,
          rayleighScattering.z / worldToUnit
        ),
        mieDensity: densityProfile(mieDensity, worldToUnit),
        mieScattering: vec3(
          mieScattering.x / worldToUnit,
          mieScattering.y / worldToUnit,
          mieScattering.z / worldToUnit
        ),
        mieExtinction: vec3(
          mieExtinction.x / worldToUnit,
          mieExtinction.y / worldToUnit,
          mieExtinction.z / worldToUnit
        ),
        miePhaseFunctionG: float(miePhaseFunctionG),
        absorptionDensity: densityProfile(absorptionDensity, worldToUnit),
        absorptionExtinction: vec3(
          absorptionExtinction.x / worldToUnit,
          absorptionExtinction.y / worldToUnit,
          absorptionExtinction.z / worldToUnit
        ),
        groundAlbedo: vec3(groundAlbedo),
        minCosLight: float(minCosLight),
        sunRadianceToLuminance: vec3(sunRadianceToLuminance),
        skyRadianceToLuminance: vec3(skyRadianceToLuminance),
        luminanceScale: float(luminanceScale),
        transmittanceTextureSize: ivec2(transmittanceTextureSize),
        irradianceTextureSize: ivec2(irradianceTextureSize),
        multipleScatteringTextureSize: uvec2(multipleScatteringTextureSize),
        scatteringTextureRadiusSize: uint(scatteringTextureRadiusSize),
        scatteringTextureCosViewSize: uint(scatteringTextureCosViewSize),
        scatteringTextureCosLightSize: uint(scatteringTextureCosLightSize),
        scatteringTextureCosViewLightSize: uint(
          scatteringTextureCosViewLightSize
        )
      }).toConst('atmosphereParameters')
    )
  }

  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  dispose(): void {}
}

export function getAtmosphereContextBase(
  builder: NodeBuilder
): AtmosphereContextBase {
  if (typeof builder.context.getAtmosphere !== 'function') {
    throw new Error('getAtmosphere() was not found in the builder context.')
  }
  const context = builder.context.getAtmosphere()
  if (!(context instanceof AtmosphereContextBase)) {
    throw new Error(
      'getAtmosphere() must return an instanceof AtmosphereContextBase.'
    )
  }
  return context
}
