import type { StoryFn } from '@storybook/react-vite'
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode
} from 'postprocessing'
import {
  Clock,
  Group,
  HalfFloatType,
  Mesh,
  MeshPhysicalMaterial,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  TorusKnotGeometry,
  Vector3,
  WebGLRenderer
} from 'three'
import { OrbitControls } from 'three-stdlib'

import {
  AerialPerspectiveEffect,
  getMoonDirectionECEF,
  getSunDirectionECEF,
  PrecomputedTexturesGenerator,
  SkyLightProbe,
  SkyMaterial,
  SunDirectionalLight
} from '@takram/three-atmosphere'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import {
  DitheringEffect,
  LensFlareEffect
} from '@takram/three-geospatial-effects'

let renderer: WebGLRenderer
let camera: PerspectiveCamera
let controls: OrbitControls
let clock: Clock
let scene: Scene
let skyMaterial: SkyMaterial
let skyLight: SkyLightProbe
let sunLight: SunDirectionalLight
let aerialPerspective: AerialPerspectiveEffect
let composer: EffectComposer

const sunDirection = new Vector3()
const moonDirection = new Vector3()

// A midnight sun in summer.
const referenceDate = new Date('2000-06-01T10:00:00Z')
const geodetic = new Geodetic(0, radians(67), 1000)
const position = geodetic.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

function init(container: HTMLDivElement): void {
  const aspect = window.innerWidth / window.innerHeight
  camera = new PerspectiveCamera(75, aspect, 10, 1e6)
  camera.position.copy(position)
  camera.up.copy(up)

  controls = new OrbitControls(camera, container)
  controls.enableDamping = true
  controls.minDistance = 1e3
  controls.target.copy(position)

  clock = new Clock()
  scene = new Scene()

  // SkyMaterial disables projection. Provide a plane that covers clip space.
  skyMaterial = new SkyMaterial()
  const sky = new Mesh(new PlaneGeometry(2, 2), skyMaterial)
  sky.frustumCulled = false
  scene.add(sky)

  // SkyLightProbe computes sky irradiance of its position.
  skyLight = new SkyLightProbe()
  skyLight.position.copy(position)
  scene.add(skyLight)

  // SunDirectionalLight computes sunlight transmittance to its target position.
  sunLight = new SunDirectionalLight({ distance: 300 })
  sunLight.target.position.copy(position)
  sunLight.castShadow = true
  sunLight.shadow.camera.top = 300
  sunLight.shadow.camera.bottom = -300
  sunLight.shadow.camera.left = -300
  sunLight.shadow.camera.right = 300
  sunLight.shadow.camera.near = 0
  sunLight.shadow.camera.far = 600
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  sunLight.shadow.normalBias = 1
  scene.add(sunLight)
  scene.add(sunLight.target)

  const group = new Group()
  Ellipsoid.WGS84.getEastNorthUpFrame(position).decompose(
    group.position,
    group.quaternion,
    group.scale
  )
  scene.add(group)

  const torusKnot = new Mesh(
    new TorusKnotGeometry(200, 60, 256, 64),
    new MeshPhysicalMaterial({
      color: 'white',
      roughness: 0.5,
      ior: 1.45,
      clearcoat: 1,
      clearcoatRoughness: 0.1
    })
  )
  torusKnot.castShadow = true
  torusKnot.receiveShadow = true
  group.add(torusKnot)

  // Demonstrates light-source lighting here. For post-process lighting, set
  // sunLight and skyLight to true, remove SkyLightProbe and
  // SunDirectionalLight, and provide a normal buffer to
  // AerialPerspectiveEffect.
  aerialPerspective = new AerialPerspectiveEffect(camera)

  renderer = new WebGLRenderer({
    depth: false,
    logarithmicDepthBuffer: true
  })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.toneMapping = NoToneMapping
  renderer.toneMappingExposure = 10
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  // Use floating-point render buffer, as radiance/luminance is stored here.
  composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 8
  })
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new EffectPass(camera, aerialPerspective))
  composer.addPass(
    new EffectPass(
      camera,
      new LensFlareEffect(),
      new ToneMappingEffect({ mode: ToneMappingMode.AGX }),
      new DitheringEffect()
    )
  )

  // Generate precomputed textures.
  const generator = new PrecomputedTexturesGenerator(renderer)
  generator.update().catch((error: unknown) => {
    console.error(error)
  })

  const { textures } = generator
  Object.assign(skyMaterial, textures)
  sunLight.transmittanceTexture = textures.transmittanceTexture
  skyLight.irradianceTexture = textures.irradianceTexture
  Object.assign(aerialPerspective, textures)

  container.appendChild(renderer.domElement)
  window.addEventListener('resize', onWindowResize)
  renderer.setAnimationLoop(render)
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function render(): void {
  const date = +referenceDate + ((clock.getElapsedTime() * 5e6) % 864e5)
  getSunDirectionECEF(date, sunDirection)
  getMoonDirectionECEF(date, moonDirection)

  skyMaterial.sunDirection.copy(sunDirection)
  skyMaterial.moonDirection.copy(moonDirection)
  sunLight.sunDirection.copy(sunDirection)
  skyLight.sunDirection.copy(sunDirection)
  aerialPerspective.sunDirection.copy(sunDirection)

  sunLight.update()
  skyLight.update()
  controls.update()
  composer.render()
}

const Story: StoryFn = () => (
  <div
    ref={ref => {
      if (ref != null) {
        init(ref)
      }
    }}
  />
)

export default Story
