import {
  GlobeControls as GlobeControlsBase,
  type GlobeControlsProps
} from '3d-tiles-renderer/r3f'
import type { GlobeControls as GlobeControlsImpl } from '3d-tiles-renderer/three'
import type { FC, ForwardedRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Mesh, Scene } from 'three'

import { reinterpretType } from '@takram/three-geospatial'

import { modifyPivotMesh } from '../helpers/GlobeControls'

const initControls =
  (overlayScene?: Scene) =>
  (controls: GlobeControlsImpl): void => {
    reinterpretType<
      GlobeControlsImpl & {
        pivotMesh: Mesh
      }
    >(controls)

    modifyPivotMesh(controls.pivotMesh)

    controls.addEventListener('start', () => {
      if (controls.pivotMesh.parent != null) {
        overlayScene?.add(controls.pivotMesh)
      }
    })
  }

export const GlobeControls: FC<
  GlobeControlsProps & {
    ref?: ForwardedRef<GlobeControlsImpl>
    overlayScene?: Scene
  }
> = ({ overlayScene, ...props }) => (
  <GlobeControlsBase
    ref={mergeRefs([props.ref, initControls(overlayScene)])}
    {...props}
  />
)
