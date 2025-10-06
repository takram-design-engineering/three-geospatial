import { OrbitControls } from '@react-three/drei'
import {
  extend,
  useFrame,
  useThree,
  type ThreeElement
} from '@react-three/fiber'
import { TilesPlugin } from '3d-tiles-renderer/r3f'
import { Suspense, useRef, useState, type FC } from 'react'
import { AgXToneMapping, Vector3, type Object3D } from 'three'
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
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
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
import { useSpringControl } from '../hooks/useSpringControl'
import { ReorientationPlugin } from '../plugins/ReorientationPlugin'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
  }
}

extend({ AtmosphereLight })

const KNOT_TO_SI = 0.5144444444

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

  const [reorientationPlugin, setReorientationPlugin] =
    useState<ReorientationPlugin | null>(null)

  // https://www.flightaware.com/live/flight/QFA10/history/20250928/1105Z/EGLL/YPPH/tracklog
  const stateRef = useRef({
    longitude: radians(12.9425),
    latitude: radians(47.5529)
  })
  const motionHeight = useSpringControl(({ height }: StoryArgs) => height)
  const motionKnots = useSpringControl(({ knots }: StoryArgs) => knots)

  const modelRef = useRef<Object3D>(null)
  const geodetic = new Geodetic()
  const position = new Vector3()
  useFrame((state, delta) => {
    let { longitude, latitude } = stateRef.current

    // The radii of curvature of meridian and prime vertical circle:
    // Reference: https://www.gsi.go.jp/common/000258740.pdf
    const a = Ellipsoid.WGS84.maximumRadius
    const e2 = Ellipsoid.WGS84.eccentricitySquared
    const e = Math.sqrt(e2)
    const W = 1 - e * Math.sin(latitude)
    const M = (a * (1 - e2)) / W ** 3
    const N = a / W

    const heading = radians(130)
    const height = motionHeight.get()
    const theta = heading - Math.PI / 2
    const ddt = motionKnots.get() * KNOT_TO_SI * delta
    const dx = (ddt * Math.sin(theta)) / ((N + height) * Math.cos(latitude))
    const dy = (ddt * Math.cos(theta)) / (M + height)
    longitude += dx
    latitude += dy
    Object.assign(stateRef.current, { longitude, latitude })

    Ellipsoid.WGS84.getNorthUpEastFrame(
      geodetic.set(longitude, latitude, height).toECEF(position),
      context.matrixWorldToECEF.value
    )
    if (reorientationPlugin != null) {
      reorientationPlugin.lon = longitude
      reorientationPlugin.lat = latitude
      reorientationPlugin.height = height
      reorientationPlugin.update()
    }
    if (modelRef.current != null) {
      modelRef.current.rotation.y = -heading
    }
  })

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
        <B787 ref={modelRef} />
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

interface StoryArgs extends OutputPassArgs, ToneMappingArgs, LocalDateArgs {
  height: number
  knots: number
}

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
      position: [70, 15, 40],
      near: 10,
      far: 1e7
    }}
    shadows
  >
    <Content {...props} />
    <Description>
      <Attribution>
        Model: Boeing 787-9 Qantas Centenary / mudkipz321
      </Attribution>
      <TilesAttribution />
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  // https://www.flightaware.com/live/flight/QFA10/history/20250928/1105Z/EGLL/YPPH/tracklog
  height: 10660,
  knots: 479,
  ...localDateArgs({
    dayOfYear: 271,
    timeOfDay: 8.8447
  }),
  ...toneMappingArgs({
    toneMappingExposure: 3
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  height: {
    control: {
      type: 'range',
      min: 3000,
      max: 13000
    }
  },
  knots: {
    name: 'knots',
    control: {
      type: 'range',
      min: 0,
      max: 666 // Mach 1
    }
  },
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}

export default Story
