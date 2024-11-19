import { OrbitControls, TorusKnot } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { SMAA, ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react'
import { ToneMappingMode } from 'postprocessing'
import {
  Fragment,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FC
} from 'react'
import { Material, MeshBasicMaterial, MeshLambertMaterial } from 'three'

import { computeSunLightColor } from '@geovanni/atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  Stars,
  type AtmosphereApi
} from '@geovanni/atmosphere/react'
import { Ellipsoid, Geodetic, radians, TilingScheme } from '@geovanni/core'
import { EastNorthUpFrame, EllipsoidMesh } from '@geovanni/core/react'
import { CascadedDirectionalLights, CSM, useCSM } from '@geovanni/csm/react'
import {
  Depth,
  Dithering,
  EffectComposer,
  LensFlare,
  Normal
} from '@geovanni/effects/react'
import { IonTerrain } from '@geovanni/terrain'
import { BatchedTerrainTile } from '@geovanni/terrain/react'

import { Stats } from '../helpers/Stats'
import { useColorGradingControls } from '../helpers/useColorGradingControls'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useRendererControls } from '../helpers/useRendererControls'

const location = new Geodetic(radians(138.731), radians(35.363), 4500)
const position = location.toECEF()
const up = Ellipsoid.WGS84.getSurfaceNormal(position)

const tilingScheme = new TilingScheme()
const tile = tilingScheme.geodeticToTile(location, 7)
tile.y = tilingScheme.getSize(tile.z).y - tile.y - 1
const terrain = new IonTerrain({
  assetId: 1,
  apiToken: import.meta.env.STORYBOOK_ION_API_TOKEN
})

const basicMaterial = new MeshBasicMaterial({ color: 'white' })
const terrainBasicMaterial = new MeshBasicMaterial({ color: 'gray' })

const Scene: FC = () => {
  useRendererControls({ exposure: 10 })
  const lut = useColorGradingControls()
  const { lensFlare, normal, depth } = useControls(
    'effects',
    {
      lensFlare: true,
      depth: false,
      normal: false
    },
    { collapsed: true }
  )
  const motionDate = useLocalDateControls()
  const { osculateEllipsoid, photometric } = useControls(
    'atmosphere',
    {
      osculateEllipsoid: true,
      photometric: true
    },
    { collapsed: true }
  )
  const { enabled, transmittance, inscatter } = useControls(
    'aerial perspective',
    {
      enabled: true,
      transmittance: true,
      inscatter: true
    }
  )
  const { mode, shadow, sun, sky } = useControls('lighting', {
    mode: {
      options: ['forward', 'deferred'] as const
    },
    shadow: true,
    sun: true,
    sky: true
  })

  const { gl, scene } = useThree()
  useLayoutEffect(() => {
    gl.shadowMap.enabled = shadow
    scene.traverse(child => {
      if ('material' in child && child.material instanceof Material) {
        child.material.needsUpdate = true
      }
    })
  }, [shadow, gl, scene])

  const csm = useCSM()
  const standardMaterial = useMemo(
    () =>
      csm.setupMaterial(
        new MeshLambertMaterial({
          color: 'white'
        })
      ),
    [csm]
  )
  const terrainStandardMaterial = useMemo(
    () =>
      csm.setupMaterial(
        new MeshLambertMaterial({
          color: 'gray'
        })
      ),
    [csm]
  )

  useEffect(() => {
    return () => {
      standardMaterial.dispose()
    }
  }, [standardMaterial])
  useEffect(() => {
    return () => {
      terrainStandardMaterial.dispose()
    }
  }, [terrainStandardMaterial])

  const atmosphereRef = useRef<AtmosphereApi>(null)
  useFrame(() => {
    const atmosphere = atmosphereRef.current
    if (atmosphere == null) {
      return
    }
    atmosphere.update(new Date(motionDate.get()))

    csm.directionalLights.direction
      .copy(atmosphere.sunDirection)
      .multiplyScalar(-1)

    if (atmosphere.textures != null) {
      computeSunLightColor(
        atmosphere.textures.transmittanceTexture,
        position,
        atmosphere.sunDirection,
        csm.directionalLights.mainLight.color,
        {
          osculateEllipsoid,
          photometric
        }
      )
    }
  })

  const [material, terrainMaterial] = {
    forward: [standardMaterial, terrainStandardMaterial],
    deferred: [basicMaterial, terrainBasicMaterial]
  }[mode]

  return (
    <Atmosphere
      ref={atmosphereRef}
      texturesUrl='/'
      osculateEllipsoid={osculateEllipsoid}
      photometric={photometric}
    >
      <OrbitControls target={position} minDistance={1e3} />
      <Sky />
      {sky && <SkyLight position={position} />}
      <Stars dataUrl='/stars.bin' />
      <CascadedDirectionalLights
        intensity={mode === 'forward' && sun ? 1 : 0}
      />
      <EllipsoidMesh
        args={[Ellipsoid.WGS84.radii, 360, 180]}
        material={terrainMaterial}
        receiveShadow
      />
      <Suspense>
        <BatchedTerrainTile
          terrain={terrain}
          {...tile}
          depth={5}
          computeVertexNormals
          material={terrainMaterial}
          receiveShadow
          castShadow
        />
      </Suspense>
      <EastNorthUpFrame {...location}>
        <TorusKnot
          args={[200, 60, 256, 64]}
          position={[0, 0, 20]}
          material={material}
          receiveShadow
          castShadow
        />
      </EastNorthUpFrame>
      <EffectComposer multisampling={0}>
        <Fragment
          // Effects are order-dependant; we need to reconstruct the nodes.
          key={JSON.stringify({
            enabled,
            mode,
            sun,
            sky,
            transmittance,
            inscatter,
            lensFlare,
            normal,
            depth,
            lut
          })}
        >
          {enabled && !normal && !depth && (
            <AerialPerspective
              sunIrradiance={mode === 'deferred' && sun}
              skyIrradiance={mode === 'deferred' && sky}
              transmittance={transmittance}
              inscatter={inscatter}
            />
          )}
          {lensFlare && <LensFlare />}
          {depth && <Depth useTurbo />}
          {normal && <Normal octEncoded />}
          {!normal && !depth && (
            <>
              <ToneMapping mode={ToneMappingMode.AGX} />
              {lut != null && lut}
              <SMAA />
              <Dithering />
            </>
          )}
        </Fragment>
      </EffectComposer>
    </Atmosphere>
  )
}

const Story: StoryFn = () => (
  <Canvas
    gl={{
      antialias: false,
      depth: false,
      stencil: false,
      logarithmicDepthBuffer: true
    }}
    camera={{ near: 100, far: 1e6, position, up }}
  >
    <Stats />
    <CSM far={1e5} margin={7000} mapSize={4096}>
      <Scene />
    </CSM>
  </Canvas>
)

export default Story
