import {
  AgXToneMapping,
  Clock,
  Mesh,
  PerspectiveCamera,
  Scene,
  TorusKnotGeometry,
  Vector3
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { pass, toneMapping } from 'three/tsl'
import {
  MeshPhysicalNodeMaterial,
  PostProcessing,
  WebGPURenderer
} from 'three/webgpu'

import {
  getECIToECEFRotationMatrix,
  getMoonDirectionECI,
  getSunDirectionECI
} from '@takram/three-atmosphere'
import {
  AtmosphereContextNode,
  AtmosphereLight,
  AtmosphereLightNode,
  skyBackground
} from '@takram/three-atmosphere/webgpu'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { dithering } from '@takram/three-geospatial/webgpu'

import type { StoryFC } from '../components/createStory'

// Geospatial configurations:
const date = new Date('2000-06-01T10:00:00Z')
const longitude = 0 // In degrees
const latitude = 67 // In degrees
const height = 500 // In meters

async function init(container: HTMLDivElement): Promise<() => void> {
  const renderer = new WebGPURenderer()
  renderer.shadowMap.enabled = true

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
  const camera = new PerspectiveCamera(50, aspect)

  // We're going to rebase the world origin to the ECEF coordinates so that we
  // can keep the camera position near the world origin:
  camera.position.set(-4, 0, 0) // Heading north

  // The atmosphere context manages resources like LUTs and uniforms shared by
  // multiple nodes:
  const context = new AtmosphereContextNode()

  // Create a scene with a sky background:
  const scene = new Scene()
  scene.backgroundNode = skyBackground(context).add(dithering)

  // Move and rotate the ellipsoid so that the world origin locates at
  // the ECEF coordinates, and the scene's orientation aligns with
  // x: north, y: up, z: east.
  Ellipsoid.WGS84.getNorthUpEastFrame(
    positionECEF,
    context.matrixWorldToECEF.value
  )

  // Create a torus knot inside the group:
  const geometry = new TorusKnotGeometry(0.5, 0.15, 256, 64)
  const material = new MeshPhysicalNodeMaterial({ roughness: 0 })
  const mesh = new Mesh(geometry, material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.rotation.x = Math.PI / 2
  mesh.rotation.z = Math.PI / 2
  scene.add(mesh)

  // AtmosphereLightNode must be associated with AtmosphereLight in the
  // renderer's node library before use:
  renderer.library.addLight(AtmosphereLightNode, AtmosphereLight)

  // Create the atmospheric light. Note that this story omits the atmospheric
  // scattering, which is only plausible when the distance between the camera
  // and scene objects is small enough to ignore it.
  const light = new AtmosphereLight(context)
  light.castShadow = true
  light.distance = 1 // Distance from the light target to the light
  light.shadow.camera.top = 1
  light.shadow.camera.bottom = -1
  light.shadow.camera.left = -1
  light.shadow.camera.right = 1
  light.shadow.camera.near = 0
  light.shadow.camera.far = 2
  light.shadow.mapSize.width = 2048
  light.shadow.mapSize.height = 2048
  light.shadow.normalBias = 0.01
  scene.add(light)
  scene.add(light.target)

  const controls = new OrbitControls(camera, container)
  controls.enableDamping = true
  controls.minDistance = 1

  // Post-processing for applying dithering after tone mapping:
  const passNode = pass(scene, camera, { samples: 4 })
  const toneMappingNode = toneMapping(AgXToneMapping, 3, passNode)
  const postProcessing = new PostProcessing(renderer)
  postProcessing.outputNode = toneMappingNode.add(dithering)

  // Rendering loop:
  const clock = new Clock()
  const observerECEF = new Vector3()
  void renderer.setAnimationLoop(() => {
    controls.update()
    camera.updateMatrixWorld()
    observerECEF
      .setFromMatrixPosition(camera.matrixWorld)
      .applyMatrix4(context.matrixWorldToECEF.value)

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
