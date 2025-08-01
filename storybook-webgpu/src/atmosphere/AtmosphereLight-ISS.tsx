import { OrbitControls } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { useMemo, useState, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { pass } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControl,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControl,
  type LocationArgs
} from '../controls/locationControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControl,
  type OutputPassArgs
} from '../controls/outputPassControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControl,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { Globe } from '../helpers/Globe'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { ISS } from '../models/ISS'
import { ReorientationPlugin } from '../plugins/ReorientationPlugin'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const worldToECEFMatrix = useMemo(() => new Matrix4(), [])
  const sunDirectionECEF = useMemo(() => new Vector3(), [])

  // Post-processing:

  const [postProcessing, passNode, lutNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const lutNode = atmosphereLUT()

    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      null,
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera])

  aerialNode.light = false
  aerialNode.worldToECEFMatrix = worldToECEFMatrix
  aerialNode.sunDirectionECEF = sunDirectionECEF

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass control:
  useOutputPassControl(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.needsUpdate = true
  })

  // Tone mapping control:
  useToneMappingControl(() => {
    postProcessing.needsUpdate = true
  })

  // Location control:
  const [reorientationPlugin, setReorientationPlugin] =
    useState<ReorientationPlugin | null>(null)
  const [longitude] = useLocationControl(
    worldToECEFMatrix,
    (longitude, latitude, height) => {
      if (reorientationPlugin != null) {
        reorientationPlugin.lon = radians(longitude)
        reorientationPlugin.lat = radians(latitude)
        reorientationPlugin.height = height
        reorientationPlugin.invalidate()
      }
    }
  )

  // Local date control (depends on the longitude of the location):
  useLocalDateControl(longitude, date => {
    getSunDirectionECEF(date, sunDirectionECEF)
  })

  return (
    <>
      <atmosphereLight
        ref={light => {
          if (light != null) {
            // Share the references to sync updates with the light.
            light.worldToECEFMatrix = worldToECEFMatrix
            light.sunDirectionECEF = sunDirectionECEF
          }
        }}
        lutNode={lutNode}
      />
      <OrbitControls minDistance={20} maxDistance={1e5} />
      <group rotation-x={-Math.PI / 2}>
        <ISS
          worldToECEFMatrix={worldToECEFMatrix}
          sunDirectionECEF={sunDirectionECEF}
          rotation-x={Math.PI / 2}
          rotation-y={Math.PI / 2}
        />
      </group>
      <Globe overrideMaterial={MeshLambertNodeMaterial}>
        <TilesPlugin
          ref={setReorientationPlugin}
          plugin={ReorientationPlugin}
        />
      </Globe>
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocationArgs,
    LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      logarithmicDepthBuffer: true,
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{
      fov: 50,
      position: [80, 30, 100],
      near: 10,
      far: 1e7
    }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...outputPassArgs(),
  ...toneMappingArgs({
    toneMappingExposure: 4
  }),
  ...locationArgs({
    longitude: -110,
    latitude: 45,
    height: 408000
  }),
  ...localDateArgs({
    dayOfYear: 170,
    timeOfDay: 17
  })
}

Story.argTypes = {
  ...outputPassArgTypes(),
  ...toneMappingArgTypes(),
  ...locationArgTypes({
    minHeight: 3000,
    maxHeight: 408000
  }),
  ...localDateArgTypes
}

export default Story
