import { OrbitControls, Sphere } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { useMemo, useRef, type FC } from 'react'
import { pass } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereLight,
  AtmosphereLightNode,
  atmosphereLUT,
  AtmosphereRenderingContext,
  skyEnvironment
} from '@takram/three-atmosphere/webgpu'

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
  physicalMaterialArgs,
  physicalMaterialArgTypes,
  usePhysicalMaterialControls,
  type PhysicalMaterialArgs
} from '../controls/physicalMaterialControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useResource } from '../helpers/useResource'
import { useTransientControl } from '../helpers/useTransientControl'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'

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

  const renderingContext = useMemo(() => new AtmosphereRenderingContext(), [])
  renderingContext.camera = camera

  const lutNode = useResource(() => atmosphereLUT())

  // Post-processing:

  const [postProcessing, passNode, aerialNode] = useResource(() => {
    const passNode = pass(scene, camera)

    const aerialNode = aerialPerspective(
      renderingContext,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth'),
      null,
      lutNode,
      { lighting: false }
    )

    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = aerialNode

    return [postProcessing, passNode, aerialNode]
  }, [renderer, scene, camera, renderingContext, lutNode])

  useFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:
  useOutputPassControls(passNode, camera, outputNode => {
    postProcessing.outputNode = outputNode ?? aerialNode
    postProcessing.needsUpdate = true
  })

  // Tone mapping controls:
  useToneMappingControls(() => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  const [longitude] = useLocationControls(renderingContext.worldToECEFMatrix)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
    getSunDirectionECEF(date, renderingContext.sunDirectionECEF)
  })

  const envNode = useResource(() => skyEnvironment(renderingContext, lutNode))
  const lightRef = useRef<AtmosphereLight>(null)
  useTransientControl(
    ({ directLight, indirectLight, environmentMap }: StoryArgs) => ({
      directLight,
      indirectLight,
      environmentMap
    }),
    ({ directLight, indirectLight, environmentMap }) => {
      const light = lightRef.current
      if (light != null) {
        light.direct = directLight
        light.indirect = indirectLight && !environmentMap
      }
      // As of r178, the scene's environmentNode does not trigger updates on the
      // assigned node. Also assign it to the backgroundNode to workaround here.
      scene.environmentNode = environmentMap ? envNode : null
      scene.backgroundNode = environmentMap ? envNode : null
    }
  )

  return (
    <>
      <atmosphereLight ref={lightRef} args={[renderingContext, lutNode]} />
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere
        args={[0.5, 128, 128]}
        position={[0, 0.5, 0]}
        material={usePhysicalMaterialControls()}
      />
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs,
    ToneMappingArgs,
    LocationArgs,
    LocalDateArgs,
    PhysicalMaterialArgs {
  directLight: boolean
  indirectLight: boolean
  environmentMap: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{ position: [2, 1, 2] }}
  >
    <Scene {...props} />
  </WebGPUCanvas>
)

Story.args = {
  ...outputPassArgs(),
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...physicalMaterialArgs(),
  directLight: true,
  indirectLight: true,
  environmentMap: false
}

Story.argTypes = {
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...toneMappingArgTypes(),
  ...locationArgTypes(),
  ...localDateArgTypes(),
  ...physicalMaterialArgTypes(),
  directLight: {
    control: {
      type: 'boolean'
    }
  },
  indirectLight: {
    control: {
      type: 'boolean'
    }
  },
  environmentMap: {
    control: {
      type: 'boolean'
    }
  }
}

export default Story
