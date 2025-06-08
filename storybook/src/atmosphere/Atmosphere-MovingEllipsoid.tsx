import { css } from '@emotion/react'
import {
  GizmoHelper,
  GizmoViewport,
  OrbitControls,
  Plane
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ToneMapping } from '@react-three/postprocessing'
import { type StoryFn } from '@storybook/react-vite'
import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import { CanvasTexture, Vector3 } from 'three'
import invariant from 'tiny-invariant'

import { type SunDirectionalLight } from '@takram/three-atmosphere'
import {
  AerialPerspective,
  Atmosphere,
  Sky,
  SkyLight,
  Stars,
  SunLight,
  type AtmosphereApi
} from '@takram/three-atmosphere/r3f'
import { Ellipsoid, Geodetic, radians } from '@takram/three-geospatial'
import { Dithering, LensFlare } from '@takram/three-geospatial-effects/r3f'

import { EffectComposer } from '../helpers/EffectComposer'
import { LittlestTokyo, type LittlestTokyoApi } from '../helpers/LittlestTokyo'
import { Stats } from '../helpers/Stats'
import { useControls } from '../helpers/useControls'
import { useLocalDateControls } from '../helpers/useLocalDateControls'
import { useLocationControls } from '../helpers/useLocationControls'
import { useToneMappingControls } from '../helpers/useToneMappingControls'

const geodetic = new Geodetic()
const position = new Vector3()
const east = new Vector3()
const north = new Vector3()
const up = new Vector3()
const vectorScratch = new Vector3()
const luminousEfficiency = new Vector3(0.2126, 0.7152, 0.0722)

const Scene: FC = () => {
  const { toneMappingMode } = useToneMappingControls({ exposure: 10 })
  const { longitude, latitude, height } = useLocationControls({ height: 500 })
  const motionDate = useLocalDateControls({
    longitude,
    dayOfYear: 0,
    timeOfDay: 7.3
  })
  const { correctAltitude, photometric } = useControls(
    'atmosphere',
    {
      correctAltitude: true,
      photometric: true
    },
    { collapsed: true }
  )

  const [atmosphere, setAtmosphere] = useState<AtmosphereApi | null>(null)
  useEffect(() => {
    if (atmosphere == null) {
      return
    }
    // Offset the ellipsoid so that the world space origin locates at the
    // position relative to the ellipsoid.
    geodetic.set(radians(longitude), radians(latitude), height)
    geodetic.toECEF(position)
    atmosphere.ellipsoidCenter.copy(position).multiplyScalar(-1)

    // Rotate the ellipsoid around the world space origin so that the camera's
    // orientation aligns with X: north, Y: up, Z: east, for example.
    Ellipsoid.WGS84.getEastNorthUpVectors(position, east, north, up)
    atmosphere.ellipsoidMatrix.makeBasis(north, up, east).invert()
  }, [longitude, latitude, height, atmosphere])

  useFrame(() => {
    if (atmosphere != null) {
      atmosphere.updateByDate(new Date(motionDate.get()))
    }
  })

  const modelRef = useRef<LittlestTokyoApi>(null)
  const sunLightRef = useRef<SunDirectionalLight>(null)
  useFrame(() => {
    if (sunLightRef.current == null) {
      return
    }
    const luminance = vectorScratch
      .setFromColor(sunLightRef.current.color)
      .dot(luminousEfficiency)
    modelRef.current?.setLightIntensity(luminance < 0.25 ? 1 : 0)
  })

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    invariant(ctx != null)
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, 1024, 1024)
    ctx.shadowColor = '#ffffff'
    const t = 0.4
    ctx.shadowBlur = 512 / t
    ctx.shadowOffsetX = 1024
    ctx.translate(-1024, 0)
    ctx.arc(512, 512, 512 * t, 0, Math.PI * 2)
    ctx.fillStyle = 'white'
    ctx.fill()
    return new CanvasTexture(canvas)
  }, [])

  return (
    <>
      <GizmoHelper alignment='top-left' renderPriority={2}>
        <GizmoViewport />
      </GizmoHelper>
      <OrbitControls
        target={[0, 1.8, 0]}
        minDistance={5}
        maxPolarAngle={Math.PI / 2}
      />
      <Plane args={[100, 100]} rotation-x={-Math.PI / 2} receiveShadow>
        <meshLambertMaterial color='white' transparent alphaMap={texture} />
      </Plane>
      <LittlestTokyo ref={modelRef} scale={0.01} />
      <Atmosphere
        ref={setAtmosphere}
        textures='atmosphere'
        correctAltitude={correctAltitude}
        photometric={photometric}
      >
        <Sky groundAlbedo='white' />
        <Stars data='atmosphere/stars.bin' />
        <SkyLight />
        <SunLight
          ref={sunLightRef}
          distance={5}
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
        </SunLight>
        {useMemo(
          () => (
            <EffectComposer multisampling={8}>
              <AerialPerspective />
              <LensFlare />
              <ToneMapping mode={toneMappingMode} />
              <Dithering />
            </EffectComposer>
          ),
          [toneMappingMode]
        )}
      </Atmosphere>
    </>
  )
}

const Story: StoryFn = () => (
  <>
    <Canvas
      gl={{ depth: false }}
      camera={{ position: [5, 2, 8], fov: 40 }}
      shadows
    >
      <Stats />
      <Scene />
    </Canvas>
    <div
      css={css`
        position: absolute;
        bottom: 16px;
        left: 16px;
        color: white;
        font-size: small;
        letter-spacing: 0.025em;
      `}
    >
      Model:{' '}
      <a
        href='https://www.artstation.com/artwork/1AGwX'
        target='_blank'
        rel='noreferrer'
      >
        Littlest Tokyo
      </a>{' '}
      by{' '}
      <a
        href='https://www.artstation.com/glenatron'
        target='_blank'
        rel='noreferrer'
      >
        Glen Fox
      </a>
      , CC Attribution.
    </div>
  </>
)

export default Story
