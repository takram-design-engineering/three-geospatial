import { Sphere } from '@react-three/drei'
import { extend, useThree, type ThreeElement } from '@react-three/fiber'
import { TilesPlugin, TilesRenderer } from '3d-tiles-renderer/r3f'
import { useLayoutEffect, useMemo, useState, type FC } from 'react'
import { ColorManagement, Scene } from 'three'
import {
  context,
  float,
  mrt,
  output,
  pass,
  toneMapping,
  uniform
} from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
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
  aerialPerspectiveBackdrop,
  AtmosphereContext,
  AtmosphereLight,
  AtmosphereLightNode,
  AtmosphereParameters,
  Stars
} from '@takram/three-atmosphere/webgpu'
import { radians } from '@takram/three-geospatial'
import { EastNorthUpFrame } from '@takram/three-geospatial/r3f'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { Description } from '../components/Description'
import { GlobeControls } from '../components/GlobeControls'
import { WebGPUCanvas } from '../components/WebGPUCanvas'
import { PLATEAU_TERRAIN_API_TOKEN } from '../constants'
import {
  atmosphereArgs,
  atmosphereArgTypes,
  type AtmosphereArgs
} from '../controls/atmosphereControls'
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
import { AgXPunchyToneMapping } from '../helpers/AgxToneMapping'
import { useControl } from '../hooks/useControl'
import { useGuardedFrame } from '../hooks/useGuardedFrame'
import { usePointOfView, type PointOfViewProps } from '../hooks/usePointOfView'
import { useResource } from '../hooks/useResource'
import { useTransientControl } from '../hooks/useTransientControl'
import { CesiumIonTerrainPlugin } from '../plugins/CesiumIonTerrainPlugin'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'

declare module '@react-three/fiber' {
  interface ThreeElements {
    atmosphereLight: ThreeElement<typeof AtmosphereLight>
    stars: ThreeElement<typeof Stars>
  }
}

extend({ AtmosphereLight, Stars })

const Content: FC<StoryProps> = ({
  longitude,
  latitude,
  height,
  heading,
  pitch,
  distance
}) => {
  const renderer = useThree<Renderer>(({ gl }) => gl as any)
  const scene = useThree(({ scene }) => scene)
  const camera = useThree(({ camera }) => camera)
  const overlayScene = useMemo(() => new Scene(), [])

  const higherOrderScatteringTexture = useControl(
    ({ higherOrderScatteringTexture }: StoryArgs) =>
      higherOrderScatteringTexture
  )
  const atmosphereContext = useResource(() => {
    const parameters = new AtmosphereParameters()
    parameters.higherOrderScatteringTexture = higherOrderScatteringTexture
    return new AtmosphereContext(parameters)
  }, [higherOrderScatteringTexture])

  atmosphereContext.camera = camera

  useLayoutEffect(() => {
    renderer.contextNode = context({
      ...renderer.contextNode.value,
      getAtmosphere: () => atmosphereContext
    })
  }, [renderer, atmosphereContext])

  const backdropNode = useResource(() => aerialPerspectiveBackdrop(), [])

  const material = useResource(
    () =>
      new MeshPhysicalNodeMaterial({
        roughness: 1,
        metalness: 0,
        clearcoatRoughness: 0,
        clearcoat: 1,
        backdropNode,
        backdropAlphaNode: float(1)
      }),
    [backdropNode]
  )

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

    const { autoClearColor, outputColorSpace } = renderer
    renderer.autoClearColor = false
    renderer.outputColorSpace = ColorManagement.workingColorSpace
    renderer.render(overlayScene, camera)
    renderer.autoClearColor = autoClearColor
    renderer.outputColorSpace = outputColorSpace
  }, 1)

  useTransientControl(
    ({
      transmittance,
      inscattering,
      showGround,
      raymarchScattering
    }: StoryArgs) => ({
      transmittance,
      inscattering,
      showGround,
      raymarchScattering
    }),
    ({ transmittance, inscattering, showGround, raymarchScattering }) => {
      aerialNode.transmittance = transmittance
      aerialNode.inscattering = inscattering
      atmosphereContext.showGround = showGround
      atmosphereContext.raymarchScattering = raymarchScattering
      renderPipeline.needsUpdate = true

      backdropNode.transmittance = transmittance
      backdropNode.inscattering = inscattering
      backdropNode.needsUpdate = true
      material.needsUpdate = true
    }
  )

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

  // Apply the initial point of view.
  usePointOfView({
    longitude,
    latitude,
    height,
    heading,
    pitch,
    distance
  })

  // Local date controls (depends on the longitude of the location):
  useLocalDateControls(longitude, date => {
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

  const [tilesScene, setTilesScene] = useState<Scene | null>(null)

  return (
    <>
      <atmosphereLight />
      <stars camera={camera} />
      <EastNorthUpFrame
        longitude={radians(longitude)}
        latitude={radians(latitude)}
        height={1200}
      >
        <Sphere args={[600, 360, 180]} material={material} />
      </EastNorthUpFrame>
      <scene ref={setTilesScene}>
        <GlobeControls
          enableDamping
          scene={tilesScene}
          overlayScene={overlayScene}
        />
        <TilesRenderer>
          <TilesPlugin
            plugin={CesiumIonTerrainPlugin}
            args={{
              apiToken: PLATEAU_TERRAIN_API_TOKEN,
              assetId: 3258112, // PLATEAU terrain dataset
              autoRefreshToken: true
            }}
          />
          <TilesPlugin plugin={TileMaterialReplacementPlugin} />
          <TilesPlugin plugin={TilesFadePlugin} />
        </TilesRenderer>
      </scene>
    </>
  )
}

interface StoryProps extends PointOfViewProps {}

interface StoryArgs
  extends OutputPassArgs, ToneMappingArgs, LocalDateArgs, AtmosphereArgs {}

export const Story: StoryFC<StoryProps, StoryArgs> = props => (
  <WebGPUCanvas
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
  ...atmosphereArgs(),
  ...localDateArgs({
    dayOfYear: 0,
    timeOfDay: 9
  }),
  ...toneMappingArgs({
    toneMappingExposure: 5
  }),
  ...outputPassArgs(),
  ...rendererArgs()
}

Story.argTypes = {
  ...atmosphereArgTypes(),
  ...localDateArgTypes(),
  ...toneMappingArgTypes(),
  ...outputPassArgTypes({
    hasNormal: true,
    hasVelocity: true
  }),
  ...rendererArgTypes()
}
