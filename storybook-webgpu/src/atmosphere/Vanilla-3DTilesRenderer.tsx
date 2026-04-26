import { TilesRenderer } from '3d-tiles-renderer'
import { CesiumIonAuthPlugin } from '3d-tiles-renderer/core/plugins'
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  TileCompressionPlugin,
  UpdateOnChangePlugin
} from '3d-tiles-renderer/plugins'
import { AgXToneMapping, PerspectiveCamera, Scene, Vector3 } from 'three'
import { Inspector } from 'three/addons/inspector/Inspector.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { context, mrt, output, pass, toneMapping } from 'three/tsl'
import {
  MeshLambertNodeMaterial,
  RenderPipeline,
  WebGPURenderer
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
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { Geodetic, PointOfView, radians } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'
import { GlobeControls } from '../helpers/GlobeControls'
import { TilesFadePlugin } from '../plugins/fade/TilesFadePlugin'
import { TileCreasedNormalsPlugin } from '../plugins/TileCreasedNormalsPlugin'
import { TileMaterialReplacementPlugin } from '../plugins/TileMaterialReplacementPlugin'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')

// Geospatial configurations:
const date = new Date('2026-06-19T07:10:44+09:00')
const longitude = 139.8146 // In degrees
const latitude = 35.7455 // In degrees
const height = 0 // In meters
const heading = -110 // In degrees
const pitch = -9 // In degrees
const distance = 1000 // In meters

async function init(container: HTMLDivElement): Promise<() => void> {
  const renderer = new WebGPURenderer()
  renderer.inspector = new Inspector()
  renderer.highPrecision = true // Required when you work in ECEF coordinates

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.appendChild(renderer.domElement)
  await renderer.init()

  const aspect = window.innerWidth / window.innerHeight
  const camera = new PerspectiveCamera(75, aspect)

  // This is a fancy way to configure the camera position and orientation:
  new PointOfView(distance, radians(heading), radians(pitch)).decompose(
    new Geodetic(radians(longitude), radians(latitude), height).toECEF(),
    camera.position,
    camera.quaternion,
    camera.up
  )

  // The atmosphere context manages resources like LUTs and uniforms shared by
  // multiple nodes:
  const atmosphereContext = new AtmosphereContext()
  atmosphereContext.camera = camera
  renderer.contextNode = context({
    ...renderer.contextNode.value,
    getAtmosphere: () => atmosphereContext
  })

  // Sky background is not necessary as AerialPerspectiveNode renders it:
  const scene = new Scene()

  // Setup 3D tiles renderer:
  const tiles = new TilesRenderer()
  tiles.setCamera(camera)
  tiles.setResolutionFromRenderer(camera, renderer as any)
  tiles.registerPlugin(
    (import.meta.env.STORYBOOK_ION_API_TOKEN ?? '') !== ''
      ? new CesiumIonAuthPlugin({
          apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN,
          assetId: '2275207' // Google Photorealistic Tiles
        })
      : new GoogleCloudAuthPlugin({
          apiToken: import.meta.env.STORYBOOK_GOOGLE_MAP_API_KEY
        })
  )
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }))
  tiles.registerPlugin(new TileCompressionPlugin())
  tiles.registerPlugin(new UpdateOnChangePlugin())
  tiles.registerPlugin(
    // Manually compute normals because Google Photorealistic Tiles doesn't have
    // normals in their tiles:
    new TileCreasedNormalsPlugin({ creaseAngle: radians(30) })
  )
  tiles.registerPlugin(
    // Replace non-node materials in every tile:
    new TileMaterialReplacementPlugin(() => new MeshLambertNodeMaterial())
  )
  tiles.registerPlugin(new TilesFadePlugin())
  scene.add(tiles.group)

  // AtmosphereLightNode must be associated with AtmosphereLight in the
  // renderer's node library before use:
  renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

  // Create the atmospheric light:
  const light = new AtmosphereLight()
  scene.add(light)

  const controls = new GlobeControls(scene, camera, renderer.domElement)
  controls.enableDamping = true

  // Move the pivot mesh to another scene:
  const overlayScene = new Scene()
  controls.addEventListener('start', () => {
    if (controls.pivotMesh.parent != null) {
      overlayScene?.add(controls.pivotMesh)
    }
  })

  // Disable "adjustHeight" until the user first drags because GlobeControls
  // adjusts the camera height based on very low LOD tiles during the initial
  // load, causing the camera to jump to the sky when set to a low altitude.
  controls.adjustHeight = false
  controls.addEventListener('start', () => {
    controls.adjustHeight = true
  })

  // Create a post-processing pipeline as follows:
  // scene pass (color, depth, velocity)
  //  → aerial perspective
  //   → lens flare
  //    → tone mapping
  //     → temporal antialias
  //      → dithering
  const passNode = pass(scene, camera, { samples: 0 }).setMRT(
    mrt({
      output,
      velocity: highpVelocity
    })
  )
  const colorNode = passNode.getTextureNode('output')
  const depthNode = passNode.getTextureNode('depth')
  const velocityNode = passNode.getTextureNode('velocity')

  const aerialNode = aerialPerspective(colorNode.mul(2 / 3), depthNode)
  const lensFlareNode = lensFlare(aerialNode)
  const toneMappingNode = toneMapping(AgXToneMapping, 10, lensFlareNode)
  const taaNode = temporalAntialias(
    toneMappingNode,
    depthNode,
    velocityNode,
    camera
  )

  const overlayPassNode = pass(overlayScene, camera, {
    samples: 0,
    depthBuffer: false
  })

  const renderPipeline = new RenderPipeline(renderer)
  renderPipeline.outputNode = taaNode
    .add(dithering)
    .mul(overlayPassNode.a.oneMinus())
    .add(overlayPassNode)

  // Rendering loop:
  const observerECEF = new Vector3()
  void renderer.setAnimationLoop(() => {
    controls.update()
    camera.updateMatrixWorld()
    observerECEF.setFromMatrixPosition(camera.matrixWorld)

    // Configure the planetary conditions in the atmosphere context according to
    // the current date and optionally the point of observation:
    const matrixECIToECEF = getECIToECEFRotationMatrix(
      date,
      atmosphereContext.matrixECIToECEF.value
    )
    getSunDirectionECI(
      date,
      atmosphereContext.sunDirectionECEF.value,
      observerECEF
    ).applyMatrix4(matrixECIToECEF)
    getMoonDirectionECI(
      date,
      atmosphereContext.moonDirectionECEF.value,
      observerECEF
    ).applyMatrix4(matrixECIToECEF)

    tiles.setCamera(camera)
    tiles.setResolutionFromRenderer(camera, renderer as any)
    tiles.update()

    renderPipeline.render()
  })

  // Resizing:
  const handleResize = (): void => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', handleResize)

  // Cleanup:
  return () => {
    window.removeEventListener('resize', handleResize)
    renderPipeline.dispose()
    overlayPassNode.dispose()
    taaNode.dispose()
    lensFlareNode.dispose()
    aerialNode.dispose()
    passNode.dispose()
    controls.dispose()
    tiles.dispose()
    atmosphereContext.dispose()
    renderer.dispose()
  }
}

export const Story: StoryFC = () => (
  <div
    ref={ref => {
      if (ref != null) {
        const promise = init(ref)
        promise.catch((error: unknown) => {
          console.error(error)
        })
        return () => {
          void promise.then(dispose => {
            dispose()
          })
        }
      }
    }}
  />
)
