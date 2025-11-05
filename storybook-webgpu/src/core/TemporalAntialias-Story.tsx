import { Circle, OrbitControls, TorusKnot } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { useRef, type FC } from 'react'
import { NeutralToneMapping, type Mesh } from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import {
  checker,
  float,
  mrt,
  output,
  pass,
  toneMapping,
  uniform,
  uv,
  vec2
} from 'three/tsl'
import {
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  PMREMGenerator,
  PostProcessing,
  type Renderer
} from 'three/webgpu'

import {
  highpVelocity,
  lensFlare,
  temporalAntialias,
  type Node
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
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
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { useResource } from '../hooks/useResource'

declare module '@react-three/fiber' {
  interface ThreeElements {
    meshBasicNodeMaterial: ThreeElement<typeof MeshBasicNodeMaterial>
    meshStandardNodeMaterial: ThreeElement<typeof MeshStandardNodeMaterial>
  }
}

extend({ MeshBasicNodeMaterial, MeshStandardNodeMaterial })

const Content: FC<StoryProps> = () => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)

  const { enabled, showRejection, rotateCamera, rotateObject } = useControl(
    ({ enabled, showRejection, rotateCamera, rotateObject }: StoryArgs) => ({
      enabled,
      showRejection,
      rotateCamera,
      rotateObject
    })
  )

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

      const lensFlareNode = manage(lensFlare(colorNode))
      const toneMappingNode = manage(
        toneMapping(NeutralToneMapping, uniform(0), lensFlareNode)
      )

      let outputNode: Node = toneMappingNode
      if (enabled) {
        const taaNode = manage(
          temporalAntialias(highpVelocity)(
            toneMappingNode,
            depthNode,
            velocityNode,
            camera
          )
        )
        taaNode.debugShowRejection = showRejection
        outputNode = taaNode
      }

      const postProcessing = new PostProcessing(renderer)
      postProcessing.outputNode = outputNode

      return [postProcessing, passNode, toneMappingNode]
    },
    [renderer, scene, camera, enabled, showRejection]
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

  // Rotate the checkered knot:
  const knotRef = useRef<Mesh>(null)
  useGuardedFrame(({ clock }) => {
    if (!rotateObject) {
      return
    }
    const knot = knotRef.current
    if (knot != null) {
      knot.rotation.z = clock.getElapsedTime()
    }
  })

  return (
    <>
      <ambientLight />
      <OrbitControls autoRotate={rotateCamera} />
      <Circle args={[20, 128]} rotation-x={-Math.PI / 2}>
        <meshStandardNodeMaterial colorNode={checker(uv().mul(100)).mul(0.5)} />
      </Circle>

      {/* Checker */}
      <TorusKnot
        ref={knotRef}
        args={[1, 0.3, 256, 64]}
        scale={0.2}
        position={[-0.5, 0.5, 0.5]}
        rotation-x={Math.PI / 2}
      >
        <meshStandardNodeMaterial colorNode={checker(uv().mul(vec2(40, 4)))} />
      </TorusKnot>

      {/* Wireframe */}
      <TorusKnot
        args={[1, 0.3, 128, 16]}
        scale={0.2}
        position={[0.5, 0.5, 0.5]}
        rotation-x={Math.PI / 2}
      >
        <meshBasicNodeMaterial color='white' wireframe />
      </TorusKnot>

      {/* Over-exposure */}
      <TorusKnot
        args={[1, 0.3, 256, 64]}
        scale={0.2}
        position={[-0.5, 0.5, -0.5]}
        rotation-x={Math.PI / 2}
      >
        <meshStandardNodeMaterial emissiveNode={float(20)} />
      </TorusKnot>

      {/* Transparency */}
      <TorusKnot
        args={[1, 0.3, 256, 64]}
        scale={0.2}
        position={[0.5, 0.5, -0.5]}
        rotation-x={Math.PI / 2}
      >
        <meshStandardNodeMaterial
          metalness={1}
          roughness={0.25}
          opacity={0.1}
          transparent
          envMap={useResource(
            manage =>
              manage(new PMREMGenerator(renderer)).fromScene(
                new RoomEnvironment(),
                0.04
              ).texture,
            [renderer]
          )}
        />
      </TorusKnot>
    </>
  )
}

interface StoryProps {}

interface StoryArgs extends OutputPassArgs, ToneMappingArgs {
  enabled: boolean
  showRejection: boolean
  rotateCamera: boolean
  rotateObject: boolean
}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas camera={{ fov: 50, position: [2, 1.6, 2] }}>
    <Content {...props} />
    <Description />
  </WebGPUCanvas>
)

Story.args = {
  enabled: true,
  showRejection: false,
  rotateCamera: true,
  rotateObject: true,
  ...toneMappingArgs({
    toneMapping: NeutralToneMapping,
    toneMappingExposure: 3
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  enabled: {
    control: {
      type: 'boolean'
    }
  },
  showRejection: {
    control: {
      type: 'boolean'
    }
  },
  rotateCamera: {
    control: {
      type: 'boolean'
    }
  },
  rotateObject: {
    control: {
      type: 'boolean'
    }
  },
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({ hasNormal: false }),
  ...rendererArgTypes()
}

export default Story
