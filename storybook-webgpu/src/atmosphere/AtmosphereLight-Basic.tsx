import { OrbitControls, Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useRef, type FC } from 'react'
import { AgXToneMapping } from 'three'
import { pass, toneMapping, uniform } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  lensFlare,
  skyEnvironment
} from '@takram/three-atmosphere/webgpu'
import { dithering } from '@takram/three-geospatial/webgpu'

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
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
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

  const context = useResource(() => atmosphereContext(renderer), [renderer])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, , , toneMappingNode] = useResource(() => {
    const passNode = pass(scene, camera)
    const aerialNode = aerialPerspective(
      context,
      passNode.getTextureNode('output'),
      passNode.getTextureNode('depth')
    )
    const lensFlareNode = lensFlare(aerialNode)
    const toneMappingNode = toneMapping(
      AgXToneMapping,
      uniform(0),
      aerialNode.add(lensFlareNode)
    )
    const postProcessing = new PostProcessing(renderer)
    postProcessing.outputNode = toneMappingNode.add(dithering())

    return [
      postProcessing,
      passNode,
      aerialNode,
      lensFlareNode,
      toneMappingNode
    ]
  }, [renderer, scene, camera, context])

  useGuardedFrame(() => {
    postProcessing.render()
  }, 1)

  // Output pass controls:

  useOutputPassControls(
    postProcessing,
    passNode,
    (outputNode, outputColorTransform) => {
      postProcessing.outputNode = outputNode
      postProcessing.outputColorTransform = outputColorTransform
      postProcessing.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    postProcessing.needsUpdate = true
  })

  // Location controls:
  useLocationControls(context.worldToECEFMatrix)

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    getSunDirectionECEF(date, context.sunDirectionECEF)
  })

  const envNode = useResource(() => skyEnvironment(context), [context])
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
        light.direct.value = directLight
        light.indirect.value = indirectLight && !environmentMap
      }
      scene.environmentNode = environmentMap ? envNode : null
    }
  )

  return (
    <>
      <atmosphereLight ref={lightRef} args={[context]} />
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
  directLight: true,
  indirectLight: true,
  environmentMap: false,
  ...physicalMaterialArgs(),
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...locationArgs({
    longitude: 30,
    latitude: 35,
    height: 300
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
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
  },
  ...physicalMaterialArgTypes(),
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}

export default Story
