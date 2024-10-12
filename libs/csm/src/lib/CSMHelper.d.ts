import {
  Group,
  type Box3Helper,
  type BufferGeometry,
  type LineBasicMaterial,
  type LineSegments,
  type Mesh,
  type MeshBasicMaterial,
  type PlaneGeometry
} from 'three'

import { type CSM } from './CSM'

export class CSMHelper<T extends CSM = CSM> extends Group {
  constructor(csm: T)
  csm: T
  displayFrustum: boolean
  displayPlanes: boolean
  displayShadowBounds: boolean
  frustumLines: LineSegments<BufferGeometry, LineBasicMaterial>
  cascadeLines: Box3Helper[]
  cascadePlanes: Array<Mesh<PlaneGeometry, MeshBasicMaterial>>
  shadowLines: Box3Helper[]
  updateVisibility(): void
  update(): void
}
