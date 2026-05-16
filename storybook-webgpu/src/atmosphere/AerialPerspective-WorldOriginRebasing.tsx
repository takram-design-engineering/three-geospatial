import { OrbitControls, Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useLayoutEffect, type FC } from 'react'
import { Vector3 } from 'three'
import { context, mrt, output, pass, toneMapping, uniform } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  RenderPipeline,
  type Renderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  Stars
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
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
import { AgXPunchyToneMapping } from '../helpers/AgxToneMapping'
import { useCombinedChange } from '../hooks/useCombinedChange'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'
import { useSpringControl } from '../hooks/useSpringControl'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
    stars: ThreeElement<typeof Stars>
    meshLambertNodeMaterial: ThreeElement<typeof MeshLambertNodeMaterial>
  }
}

extend({ AtmosphereLight, Stars, MeshLambertNodeMaterial })

const geodetic = new Geodetic()
const position = new Vector3()

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const atmosphereContext = useResource(() => new AtmosphereContext(), [])
  atmosphereContext.camera = camera

  useLayoutEffect(() => {
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => atmosphereContext
    })
  }, [renderer, atmosphereContext])

  // Post-processing:

  const passNode = useResource(
    () =>
      pass(scene, camera, { samples: 0 }).setMRT(
        mrt({
          output,
          velocity: highpVelocity
        })
      ),
    [scene, camera]
  )

  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const velocityNode = passNode.getTextureNode('velocity')

  const aerialNode = useResource(
    () => aerialPerspective(colorNode, depthNode),
    [colorNode, depthNode]
  )

  const lensFlareNode = useResource(() => lensFlare(aerialNode), [aerialNode])

  const toneMappingNode = useResource(
    () => toneMapping(AgXPunchyToneMapping, uniform(0), lensFlareNode),
    [lensFlareNode]
  )

  const taaNode = useResource(
    () => temporalAntialias(toneMappingNode, depthNode, velocityNode, camera),
    [camera, depthNode, velocityNode, toneMappingNode]
  )

  const renderPipeline = useResource(
    () => new RenderPipeline(renderer, taaNode.add(dithering)),
    [renderer, taaNode]
  )

  useGuardedFrame(() => {
    renderPipeline.render()
  }, 1)

  // Output pass controls:

  useOutputPassControls(
    renderPipeline,
    passNode,
    (outputNode, outputColorTransform) => {
      renderPipeline.outputNode = outputNode
      renderPipeline.outputColorTransform = outputColorTransform
      renderPipeline.needsUpdate = true
    }
  )

  // Tone mapping controls:
  useToneMappingControls(toneMappingNode, () => {
    renderPipeline.needsUpdate = true
  })

  // Location controls:
  const longitude = useSpringControl(({ longitude }: LocationArgs) => longitude)
  const latitude = useSpringControl(({ latitude }: LocationArgs) => latitude)
  const height = useSpringControl(({ height }: LocationArgs) => height)

  useCombinedChange(
    [longitude, latitude, height],
    ([longitude, latitude, height]) => {
      Ellipsoid.WGS84.getNorthUpEastFrame(
        geodetic
          .set(radians(longitude), radians(latitude), height)
          .toECEF(position),
        atmosphereContext.matrixWorldToECEF.value
      )
    }
  )

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(date => {
    const { matrixECIToECEF, sunDirectionECEF, moonDirectionECEF } =
      atmosphereContext
    getECIToECEFRotationMatrix(date, matrixECIToECEF.value)
    getSunDirectionECI(date, sunDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
    getMoonDirectionECI(date, moonDirectionECEF.value).applyMatrix4(
      matrixECIToECEF.value
    )
  })

  return (
    <>
      <atmosphereLight />
      <stars args={[camera]} />
      <OrbitControls target={[0, 0.5, 0]} minDistance={1} />
      <Sphere args={[0.5, 128, 128]} position={[0, 0.5, 0]}>
        <meshLambertNodeMaterial />
      </Sphere>
    </>
  )
}

interface StoryProps {}

interface StoryArgs
  extends OutputPassArgs, ToneMappingArgs, LocationArgs, LocalDateArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
    camera={{ position: [2, 1, 2] }}
    renderer={{
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
  >
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
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
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasVelocity: true
  }),
  ...rendererArgTypes()
}
