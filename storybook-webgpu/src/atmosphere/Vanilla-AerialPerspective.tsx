import {
  AgXToneMapping,
  Clock,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PerspectiveCamera,
  Scene,
  TorusGeometry,
  Vector3
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { mrt, output, pass, toneMapping } from 'three/tsl'
import { PostProcessing, WebGPURenderer } from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  aerialPerspective,
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import {
  dithering,
  highpVelocity,
  lensFlare,
  temporalAntialias
} from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'

// Geospatial configurations:
const date = new Date('2000-06-01T10:00:00Z')
const longitude = 0 // In degrees
const latitude = 55 // In degrees
const height = 500 // In meters

async function init(container: HTMLDivElement): Promise<() => void> {
  const renderer = new WebGPURenderer()
  renderer.highPrecision = true // Required when you work in ECEF coordinates
  renderer.logarithmicDepthBuffer = true

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)
  container.appendChild(renderer.domElement)
  await renderer.init()

  // Convert the geographic coordinates to ECEF coordinates in meters:
  const positionECEF = new Geodetic(
    radians(longitude),
    radians(latitude),
    height
  ).toECEF()

  const aspect = window.innerWidth / window.innerHeight
  const camera = new PerspectiveCamera(90, aspect, 10, 1e6)

  // Move the camera at the ECEF coordinates with the up vector pointing towards
  // the surface normal of the ellipsoid:
  const east = new Vector3()
  const north = new Vector3()
  const up = new Vector3()
  Ellipsoid.WGS84.getEastNorthUpVectors(positionECEF, east, north, up)
  camera.up.copy(up)
  camera.position.copy(positionECEF).add(north).sub(up.multiplyScalar(0.75))

  // The atmosphere context manages resources like LUTs and uniforms shared by
  // multiple nodes:
  const context = new AtmosphereContextNode()
  context.camera = camera

  // Sky background is not necessary as AerialPerspectiveNode renders it:
  const scene = new Scene()

  const group = new Group()
  scene.add(group)

  // Position and orient the object matrix of the group:
  Ellipsoid.WGS84.getEastNorthUpFrame(positionECEF).decompose(
    group.position,
    group.quaternion,
    group.scale
  )

  // Create a huge ring inside the group:
  const radius = 1e5
  const thickness = 200
  const geometry = new TorusGeometry(radius, thickness, 128, 512)
  const material = new MeshPhysicalMaterial({ color: 0x999999, roughness: 0.5 })
  const mesh = new Mesh(geometry, material)
  mesh.scale.z = 10
  mesh.position.z = radius - height + thickness * 0.5
  mesh.rotation.y = Math.PI / 2
  group.add(mesh)

  // AtmosphereLightNode must be associated with AtmosphereLight in the
  // renderer's node library before use:
  renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

  // Create the atmospheric light:
  const light = new AtmosphereLight(context)
  scene.add(light)

  const controls = new OrbitControls(camera, container)
  controls.enableDamping = true
  controls.target.copy(positionECEF)

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

  const aerialNode = aerialPerspective(context, colorNode, depthNode)
  const lensFlareNode = lensFlare(aerialNode)
  const toneMappingNode = toneMapping(AgXToneMapping, 3, lensFlareNode)
  const taaNode = temporalAntialias(highpVelocity)(
    toneMappingNode,
    depthNode,
    velocityNode,
    camera
  )

  const postProcessing = new PostProcessing(renderer)
  postProcessing.outputNode = taaNode.add(dithering)

  // Rendering loop:
  const clock = new Clock()
  const observerECEF = new Vector3()
  void renderer.setAnimationLoop(() => {
    controls.update()
    camera.updateMatrixWorld()
    observerECEF.setFromMatrixPosition(camera.matrixWorld)

    // Configure the planetary conditions in the atmosphere context according to
    // the current date and optionally the point of observation:
    const currentDate = +date + ((clock.getElapsedTime() * 5e6) % 864e5)
    const matrixECIToECEF = getECIToECEFRotationMatrix(
      currentDate,
      context.matrixECIToECEF.value
    )
    getSunDirectionECI(
      currentDate,
      context.sunDirectionECEF.value,
      observerECEF
    ).applyMatrix4(matrixECIToECEF)
    getMoonDirectionECI(
      currentDate,
      context.moonDirectionECEF.value,
      observerECEF
    ).applyMatrix4(matrixECIToECEF)

    postProcessing.render()
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
    postProcessing.dispose()
    taaNode.dispose()
    lensFlareNode.dispose()
    aerialNode.dispose()
    passNode.dispose()
    controls.dispose()
    geometry.dispose()
    material.dispose()
    context.dispose()
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
