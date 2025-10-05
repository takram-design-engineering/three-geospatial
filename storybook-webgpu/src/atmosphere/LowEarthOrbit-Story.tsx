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

import type { StoryFC } from '../components/createStory'
import {
  Attribution,
  Description,
  TilesAttribution
} from '../components/Description'
import { Globe } from '../components/Globe'
import { ISS } from '../components/ISS'
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
        args={[context, 80]}
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
      <Suspense>
        <ISS
          matrixWorldToECEF={context.matrixWorldToECEF.value}
          sunDirectionECEF={context.sunDirectionECEF.value}
        />
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
      position: [80, 80, 100],
      near: 10,
      far: 1e7
    }}
    shadows
  >
    <Content {...props} />
    <Description>
      <p>
        This demonstrates a couple of techniques that @takram/three-atmosphere
        supports, such as <em>aerial perspective</em>, <em>atmosphere light</em>
        , <em>world origin rebasing</em>, and <em>environment map</em>.
      </p>
      <p>
        Atmospheric scattering and lighting are correct on both the ISS and the
        planet, regardless of the materials used on them. The environment map
        applied to the ISS changes dynamically as its location changes. You can
        see it by adjusting the height slider.
      </p>
      <p>
        The world origin is located at the center of the ISS model, so that the
        shadow camera of the atmosphere light does not suffer from precision
        issues.
      </p>
      <Attribution>ISS model: NASA</Attribution>
      <TilesAttribution />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 200,
    timeOfDay: 6.5
  }),
  ...locationArgs({
    longitude: -110,
    latitude: 45,
    height: 408000
  }),
  ...toneMappingArgs({
    toneMappingExposure: 4
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
