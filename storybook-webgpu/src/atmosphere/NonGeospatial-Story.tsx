import { OrbitControls, Plane, Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useRef, type FC } from 'react'
import {
  AgXToneMapping,
  BackSide,
  Matrix3,
  NeutralToneMapping,
  Vector3
} from 'three'
import { RectAreaLightTexturesLib } from 'three/addons/lights/RectAreaLightTexturesLib.js'
import {
  cameraViewMatrix,
  mrt,
  output,
  pass,
  toneMapping,
  uniform,
  vec3,
  vec4
} from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  PostProcessing,
  RectAreaLightNode,
  type Renderer
} from 'three/webgpu'

import {
  getMoonDirectionECEF,
  getSunDirectionECEF
} from '@takram/three-atmosphere'
import {
  atmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import {
  dither,
  highpVelocity,
  isWebGPU,
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
import { rendererArgs, rendererArgTypes } from '../controls/rendererControls'
import {
  toneMappingArgs,
  toneMappingArgTypes,
  useToneMappingControls,
  type ToneMappingArgs
} from '../controls/toneMappingControls'
import type { StoryFC } from '../helpers/createStory'
import { Attribution, Description } from '../helpers/Description'
import { useGuardedFrame } from '../helpers/useGuardedFrame'
import { useResource } from '../helpers/useResource'
import { WebGPUCanvas } from '../helpers/WebGPUCanvas'
import { LittlestTokyo, type LittlestTokyoApi } from '../models/LittlestTokyo'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
    meshLambertNodeMaterial: ThreeElement<typeof MeshLambertNodeMaterial>
  }
}

extend({ AtmosphereLight, MeshLambertNodeMaterial })

RectAreaLightNode.setLTC(RectAreaLightTexturesLib.init())

const vector = new Vector3()
const rotation = new Matrix3()
const up = new Vector3(0, 1, 0)

const Scene: FC<StoryProps> = () => {
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
      const toneMappingNode = toneMapping(
        AgXToneMapping,
        uniform(0),
        passNode.getTextureNode('output')
      )
      const taaNode = isWebGPU(renderer)
        ? temporalAntialias(highpVelocity)(
            toneMappingNode,
            passNode.getTextureNode('depth'),
            passNode.getTextureNode('velocity'),
            camera
          )
        : toneMappingNode
      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = taaNode.add(dither())

      manage(taaNode)
      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, scene, camera]
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
    getMoonDirectionECEF(date, context.moonDirectionECEF)
  })

  const modelRef = useRef<LittlestTokyoApi>(null)
  useGuardedFrame(() => {
    const { worldToECEFMatrix, sunDirectionECEF } = context
    const sunDirectionWorld = vector
      .copy(sunDirectionECEF)
      .applyMatrix3(rotation.setFromMatrix4(worldToECEFMatrix).transpose())
    const zenithAngle = sunDirectionWorld.dot(up)
    modelRef.current?.setLightIntensity(zenithAngle < 0.1 ? 1 : 0)
  })

  return (
    <>
      <atmosphereLight
        args={[context, 5]}
        castShadow
        shadow-normalBias={0.1}
        shadow-mapSize={[2048, 2048]}
      >
        <orthographicCamera
          attach='shadow-camera'
          top={4}
          bottom={-4}
          left={-4}
          right={4}
          near={0}
          far={600}
        />
      </atmosphereLight>
      <OrbitControls
        target={[0, 1.5, 0]}
        minDistance={5}
        maxPolarAngle={Math.PI / 2}
      />
      <Plane args={[500, 500]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshLambertNodeMaterial color={'#bfe3dd'} />
      </Plane>
      <Sphere args={[500]}>
        <meshLambertNodeMaterial
          color={'#bfe3dd'}
          normalNode={cameraViewMatrix.mul(vec4(vec3(0, 1, 0), 0)).xyz}
          side={BackSide}
        />
      </Sphere>
      <LittlestTokyo ref={modelRef} scale={0.01} />
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
      onInit: renderer => {
        renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)
      }
    }}
    camera={{ fov: 40, position: [5, 3, 9] }}
    shadows
  >
    <Scene {...props} />
    <Description css={{ color: 'gray' }}>
      <Attribution>Model: Littlest Tokyo / Glen Fox</Attribution>
    </Description>
  </WebGPUCanvas>
)

Story.args = {
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 10
  }),
  ...locationArgs({
    longitude: 0,
    latitude: 35,
    height: 0
  }),
  ...toneMappingArgs({
    toneMappingExposure: 10,
    toneMapping: NeutralToneMapping
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...localDateArgTypes(),
  ...locationArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: false
  }),
  ...rendererArgTypes()
}

export default Story
