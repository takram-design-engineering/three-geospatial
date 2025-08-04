import { Light } from 'three'

import type { AtmosphereLUTNode } from './AtmosphereLUTNode'
import type { AtmosphereRenderingContext } from './AtmosphereRenderingContext'

export class AtmosphereLight extends Light {
  override readonly type = 'AtmosphereLight'

  renderingContext?: AtmosphereRenderingContext
  lutNode?: AtmosphereLUTNode

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
