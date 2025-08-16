import type { TextureNode } from 'three/src/Three.WebGPU.js'
import type { NodeBuilder, Texture3DNode } from 'three/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type {
  AtmosphereParameters,
  AtmosphereParametersNodes
} from './AtmosphereParameters'
import type {
  AtmosphereRenderingContext,
  AtmosphereRenderingContextNodes
} from './AtmosphereRenderingContext'

export interface AtmosphereContextNodes
  extends AtmosphereParametersNodes,
    AtmosphereRenderingContextNodes {}

export interface AtmosphereContextOptions {
  constrainCamera: boolean
  showGround: boolean
}

export interface AtmosphereContext {
  parameters: AtmosphereParameters
  nodes: AtmosphereContextNodes
  textures: {
    transmittance: TextureNode
    irradiance: TextureNode
    scattering: Texture3DNode
    singleMieScattering: Texture3DNode
    higherOrderScattering: Texture3DNode
  }
  options: AtmosphereContextOptions
}

export function createAtmosphereContext(
  parameters: AtmosphereParameters,
  renderingContext: AtmosphereRenderingContext,
  lutNode: AtmosphereLUTNode,
  options?: Partial<AtmosphereContextOptions>
): AtmosphereContext {
  const nodes: AtmosphereContextNodes = {
    ...parameters.getNodes(),
    ...renderingContext?.getNodes()
  }
  return {
    parameters,
    nodes,
    textures: {
      transmittance: lutNode.getTextureNode('transmittance'),
      irradiance: lutNode.getTextureNode('irradiance'),
      scattering: lutNode.getTextureNode('scattering'),
      singleMieScattering: lutNode.getTextureNode('singleMieScattering'),
      higherOrderScattering: lutNode.getTextureNode('higherOrderScattering')
    },
    options: {
      constrainCamera: true,
      showGround: true,
      ...options
    }
  }
}

export function getAtmosphereContext(builder: NodeBuilder): AtmosphereContext {
  const context = builder.getContext()
  const { atmosphere } = context
  if (atmosphere == null) {
    throw new Error('Atmosphere context does not found.')
  }
  return atmosphere as AtmosphereContext
}
