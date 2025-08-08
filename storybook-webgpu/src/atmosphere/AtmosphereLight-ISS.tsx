import { OrbitControls } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { useState, type FC } from 'react'
import { pass } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT,
  AtmosphereRenderingContext,
  skyEnvironment
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'

import {
  localDateArgs,
  localDateArgTypes,
  useLocalDateControls,
  type LocalDateArgs
} from '../controls/localDateControls'
import {
  locationArgs,
  locationArgTypes,
  useLocationControls,
  type LocationArgs
} from '../controls/locationControls'
import {
  outputPassArgs,
  outputPassArgTypes,
  useOutputPassControls,
  type OutputPassArgs
} from '../controls/outputPassControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
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

  const context = useResource(() => new AtmosphereRenderingContext(), [])
  context.camera = camera

  const lutNode = useResource(() => atmosphereLUT(), [])

  // Post-processing:

  const [postProcessing, passNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const aerialNode = aerialPerspective(
      context,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      null,
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, context, lutNode])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:
  useOutputPassControls(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.outputColorTransform = outputNode == null
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  const [reorientationPlugin, setReorientationPlugin] =
    useState<ReorientationPlugin | null>(null)
  const [longitude] = useLocationControls(
    context.worldToECEFMatrix,
    (longitude, latitude, height) => {
      if (reorientationPlugin != null) {
        reorientationPlugin.lon = radians(longitude)
        reorientationPlugin.lat = radians(latitude)
        reorientationPlugin.height = height
        reorientationPlugin.update()
      }
    }
  )

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
    getMoonDirectionECEF(date, context.moonDirectionECEF)
  })

  const envNode = useResource(
    () => skyEnvironment(context, lutNode),
    [context, lutNode]
  )
  scene.environmentNode = envNode

  return (
    <>
      <atmosphereLight
        args={[context, lutNode, 80]}
        castShadow
        shadow-normalBias={0.1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={60}
          bottom={-60}
          left={-60}
          right={60}
          near={0}
          far={160}
        />
      </atmosphereLight>
      <OrbitControls minDistance={20} maxDistance={1e5} />
      <group rotation-x={-Math.PI / 2}>
        <ISS
          worldToECEFMatrix={context.worldToECEFMatrix}
          sunDirectionECEF={context.sunDirectionECEF}
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
    shadows
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 216,
    timeOfDay: 17
  }),
  ...locationArgs({
    longitude: -110,
    latitude: 45,
    height: 408000
  }),
  ...toneMappingArgs({
    toneMappingExposure: 4
  }),
  ...outputPassArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...locationArgTypes({
    minHeight: 3000,
    maxHeight: 408000
  }),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  })
}

export default Story
