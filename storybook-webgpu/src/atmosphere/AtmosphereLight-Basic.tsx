import { OrbitControls, Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useRef, type FC } from 'react'
import { AgXToneMapping } from 'three'
import { mrt, output, pass, toneMapping, uniform } from 'three/tsl'
import { PostProcessing, type Renderer } from 'three/webgpu'

import { getSunDirectionECEF } from '@takram/three-atmosphere'
import {
  aerialPerspective,
  atmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  skyEnvironment
} from '@takram/three-atmosphere/webgpu'
import {
  dither,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

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
import { Description } from '../helpers/Description'
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

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const context = useResource(() => atmosphereContext(renderer), [renderer])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, toneMappingNode] = useResource(
    manage => {
      const passNode = pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          velocity: highpVelocity
        })
      )
      const outputNode = passNode.getTextureNode('output')
      const depthNode = passNode.getTextureNode('depth')
      const velocityNode = passNode.getTextureNode('velocity')

      const aerialNode = aerialPerspective(context, outputNode, depthNode)
      const lensFlareNode = lensFlare(aerialNode)
      const toneMappingNode = toneMapping(
        AgXToneMapping,
        uniform(0),
        lensFlareNode
      )
      const taaNode = temporalAntialias(highpVelocity)(
        toneMappingNode,
        depthNode,
        velocityNode,
        camera
      )
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dither())

      manage(aerialNode, lensFlareNode, taaNode)
      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, scene, camera, context]
  )

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

  // Toggles the direct, indirect and environment lighting:
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
    <Content {...props} />
    <Description />
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
