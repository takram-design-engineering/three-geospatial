import type { TextureNode } from 'three/src/Three.WebGPU.js'
import type { NodeBuilder, Texture3DNode } from 'three/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type {
  AtmosphereParameters,
  AtmosphereParametersUniforms
} from './AtmosphereParameters'
import type {
  AtmosphereRenderingContext,
  AtmosphereRenderingContextUniforms
} from './AtmosphereRenderingContext'

export interface AtmosphereContextUniforms
  extends AtmosphereParametersUniforms,
    AtmosphereRenderingContextUniforms {}

export interface AtmosphereContextOptions {
  constrainCamera: boolean
  showGround: boolean
}

export interface AtmosphereContext {
  parameters: AtmosphereParameters
  uniforms: AtmosphereContextUniforms
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
  const uniforms: AtmosphereContextUniforms = {
    ...parameters.getUniforms(),
    ...renderingContext?.getUniforms()
  }
  return {
    parameters,
    uniforms,
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

export function setAtmosphereContext(
  builder: NodeBuilder,
  parameters: AtmosphereParameters,
  renderingContext: AtmosphereRenderingContext,
  lutNode: AtmosphereLUTNode,
  options?: Partial<AtmosphereContextOptions>
): void {
  builder.getContext().atmosphere = createAtmosphereContext(
    parameters,
    renderingContext,
    lutNode,
    options
  )
}
