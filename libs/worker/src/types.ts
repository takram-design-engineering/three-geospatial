import { type BufferGeometry } from 'three'

export type BufferGeometryAttributes = Pick<
  BufferGeometry,
  'attributes' | 'index'
>
