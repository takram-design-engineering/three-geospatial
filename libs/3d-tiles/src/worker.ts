/* eslint-env worker */

import { BufferAttribute, BufferGeometry } from 'three'
import { toCreasedNormals } from 'three-stdlib'
import workerpool from 'workerpool'
import type Transfer from 'workerpool/types/transfer'

import { isNotNullish } from '@geovanni/core'

export type BufferGeometryInput = Pick<BufferGeometry, 'attributes' | 'index'>

workerpool.worker({
  toCreasedNormals: (
    input: BufferGeometryInput,
    creaseAngle?: number
  ): Transfer => {
    const geometry = new BufferGeometry()
    for (const [name, attribute] of Object.entries(input.attributes)) {
      geometry.setAttribute(
        name,
        new BufferAttribute(
          attribute.array,
          attribute.itemSize,
          attribute.normalized
        )
      )
    }
    if (input.index != null) {
      geometry.index = new BufferAttribute(
        input.index.array,
        input.index.itemSize,
        input.index.normalized
      )
    }
    return new workerpool.Transfer(
      toCreasedNormals(geometry, creaseAngle),
      [
        ...Object.values(geometry.attributes).map(
          attribute => attribute.array.buffer
        ),
        geometry.index?.array.buffer
      ].filter(isNotNullish)
    )
  }
})
