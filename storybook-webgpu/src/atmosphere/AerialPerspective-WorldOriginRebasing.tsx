import { OrbitControls, Sphere } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, type FC } from 'react'
import { Matrix4, Vector3 } from 'three'
import { diffuseColor, mrt, normalView, pass } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereLUT
} from '@takram/three-atmosphere/webgpu'

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
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

const Scene: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const sunDirectionECEF = useMemo(() => new Vector3(), [])
  const worldToECEFMatrix = useMemo(() => new Matrix4().identity(), [])

  // Post-processing:

  const [postProcessing, passNode, , aerialNode] = useResource(() => {
    const passNode = pass(scene, camera).setMRT(
      mrt({
        output: diffuseColor,
        normal: normalView
      })
    )
    const lutNode = atmosphereLUT()
    const aerialNode = aerialPerspective(
      camera,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      passNode.getTextureNode('normal'),
      lutNode
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, lutNode, aerialNode]
  }, [renderer, scene, camera])

  aerialNode.light = true
  aerialNode.sunDirectionECEF = sunDirectionECEF
  aerialNode.worldToECEFMatrix = worldToECEFMatrix

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
  const [longitude] = useLocationControl(worldToECEFMatrix)

  // Local date control (depends on the longitude of the location):
  useLocalDateControl(longitude, date => {
    getSunDirectionECEF(date, sunDirectionECEF)
  })

  return (
    <>
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]} />
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocalDateArgs,
    LocationArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ position: [2, 1, 2] }}>
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...outputPassArgs,
  ...toneMappingArgs,
  ...localDateArgs,
  ...locationArgs,
  toneMappingExposure: 10,
  dayOfYear: 0,
  timeOfDay: 9,
  longitude: 30,
  latitude: 35,
  height: 300
}

Story.argTypes = {
  ...outputPassArgTypes,
  ...toneMappingArgTypes,
  ...localDateArgTypes,
  ...locationArgTypes
}

export default Story
