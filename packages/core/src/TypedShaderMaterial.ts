import {
  ShaderMaterial,
  type IUniform,
  type ShaderMaterialParameters
} from 'three'

export interface TypedShaderMaterialParameters<
  Uniforms extends Record<string, IUniform> = Record<string, IUniform<unknown>>
> extends ShaderMaterialParameters {
  uniforms: Uniforms
}

export class TypedShaderMaterial<
  Uniforms extends Record<string, IUniform> = Record<string, IUniform<unknown>>
> extends ShaderMaterial {
  declare uniforms: Record<string, IUniform<unknown>> & Uniforms

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(params: TypedShaderMaterialParameters<Uniforms>) {
    super(params)
  }
}
