import {
  GlobeControls as GlobeControlsBase,
  type GlobeControlsProps
} from '3d-tiles-renderer/r3f'
import type { GlobeControls as GlobeControlsImpl } from '3d-tiles-renderer/three'
import type { FC, ForwardedRef } from 'react'
import { mergeRefs } from 'react-merge-refs'
import type { Mesh, Scene } from 'three'

import { reinterpretType } from '@takram/three-geospatial'

import {
  createOverlaySceneProxy,
  modifyPivotMesh
} from '../helpers/GlobeControls'

const initControls =
  (overlayScene?: Scene) =>
  (controls: GlobeControlsImpl): undefined | (() => void) => {
    reinterpretType<
      GlobeControlsImpl & {
        pivotMesh: Mesh
      }
    >(controls)

    modifyPivotMesh(controls.pivotMesh)

    // HACK: Add a hook to reroute the pivot mesh to another scene:
    if (overlayScene != null) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setScene = controls.setScene
      controls.setScene = scene => {
        if (scene != null) {
          scene = createOverlaySceneProxy(scene, overlayScene, [
            controls.pivotMesh
          ])
        }
        setScene.apply(controls, [scene])
      }
      return () => {
        controls.setScene = setScene
      }
    }
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
