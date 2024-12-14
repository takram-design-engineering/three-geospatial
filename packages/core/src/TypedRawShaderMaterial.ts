import { RawShaderMaterial, type IUniform } from 'three'

import { type TypedShaderMaterialParameters } from './TypedShaderMaterial'

export class TypedRawShaderMaterial<
  Uniforms extends Record<string, IUniform> = Record<string, IUniform<unknown>>
> extends RawShaderMaterial {
  declare uniforms: Record<string, IUniform<unknown>> & Uniforms

  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(params: TypedShaderMaterialParameters<Uniforms>) {
    super(params)
  }
}
