import { Light } from 'three'

import { nodeType } from '@takram/three-geospatial/webgpu'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'

export class AtmosphereLight extends Light {
  override readonly type = 'AtmosphereLight'

  renderingContext?: AtmosphereRenderingContext
  lutNode?: AtmosphereLUTNode

  @nodeType('int')
  direct = true

  @nodeType('int')
  indirect = true

  constructor(
    renderingContext?: AtmosphereRenderingContext,
    lutNode?: AtmosphereLUTNode
  ) {
    super()
    this.renderingContext = renderingContext
    this.lutNode = lutNode
  }

  override copy(source: this, recursive?: boolean): this {
    super.copy(source, recursive)
    // Copy by reference here:
    this.renderingContext = source.renderingContext
    this.lutNode = source.lutNode
    return this
  }
}
