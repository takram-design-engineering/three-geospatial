import { OrbitControls } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { Suspense, useState, type FC } from 'react'
import { AgXToneMapping } from 'three'
import { mrt, output, pass, toneMapping, uniform } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyEnvironment
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import { B787 } from '../components/B787'
import type { StoryFC } from '../components/createStory'
import {
  Attribution,
  Description,
  TilesAttribution
} from '../components/Description'
import { Globe } from '../components/Globe'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
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
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { ReorientationPlugin } from '../plugins/ReorientationPlugin'

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

  const context = useResource(() => new AtmosphereContextNode(), [])
  context.camera = camera

  // Post-processing:

  const [postProcessing, passNode, toneMappingNode] = useResource(
    manage => {
      const passNode = manage(
        pass(scene, camera, { samples: 0 }).setMRT(
          mrt({
            output,
            velocity: highpVelocity
          })
        )
      )
      const colorNode = passNode.getTextureNode('output')
      const depthNode = passNode.getTextureNode('depth')
      const velocityNode = passNode.getTextureNode('velocity')

      const aerialNode = manage(
        aerialPerspective(context, colorNode, depthNode)
      )
      const lensFlareNode = manage(lensFlare(aerialNode))
      const toneMappingNode = manage(
        toneMapping(AgXToneMapping, uniform(0), lensFlareNode)
      )
      const taaNode = manage(
        temporalAntialias(highpVelocity)(
          toneMappingNode,
          depthNode,
          velocityNode,
          camera
        )
      )
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dithering)

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
  const [reorientationPlugin, setReorientationPlugin] =
    useState<ReorientationPlugin | null>(null)
  useLocationControls(
    context.matrixWorldToECEF.value,
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
  useLocalDateControls(date => {
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } = context
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
  })

  const envNode = useResource(() => skyEnvironment(context), [context])
  scene.environmentNode = envNode

  return (
    <>
      <atmosphereLight
        args={[context, 40]}
        castShadow
        shadow-normalBias={0.1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={40}
          bottom={-40}
          left={-40}
          right={40}
          near={0}
          far={80}
        />
      </atmosphereLight>
      <OrbitControls minDistance={45} maxDistance={1e5} />
      <Suspense>
        <B787 rotation-y={radians(-130)} />
      </Suspense>
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
      position: [80, 20, -30],
      near: 10,
      far: 1e7
    }}
    shadows
  >
    <Content {...props} />
    <Description>
      <Attribution>
        Model: Boeing 787-9 Qantas Centenary by mudkipz321
      </Attribution>
      <TilesAttribution />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  // https://www.flightaware.com/live/flight/QFA10/history/20250928/1105Z/EGLL/YPPH/tracklog
  ...localDateArgs({
    dayOfYear: 271,
    timeOfDay: 8.8447
  }),
  ...locationArgs({
    longitude: 12.9425,
    latitude: 47.5529,
    height: 10660
  }),
  ...toneMappingArgs({
    toneMappingExposure: 3
  }),
  ...outputPassArgs(),
  ...rendererArgs()
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
  }),
  ...rendererArgTypes()
}

export default Story
