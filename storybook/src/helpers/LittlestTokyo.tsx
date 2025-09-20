import { useGLTF, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentProps,
  type FC,
  type Ref
} from 'react'
import {
  AnimationMixer,
  Box3,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Light
} from 'three'

export interface LittlestTokyoApi {
  setLightIntensity: (value: number) => void
}

export interface LittlestTokyoProps extends ComponentProps<'group'> {
  ref?: Ref<LittlestTokyoApi>
}

export const LittlestTokyo: FC<LittlestTokyoProps> = ({ ref, ...props }) => {
  const gltf = useGLTF('public/littlest_tokyo.glb')
  const materials = useMemo(
    () =>
      Object.values(gltf.materials)
        .filter(material => material instanceof MeshStandardMaterial)
        .filter(material => material.map?.name === 'baseColor.jpg'),
    [gltf.materials]
  )
  const emissive = useTexture('public/littlest_tokyo_emissive.jpg', texture => {
    texture.colorSpace = SRGBColorSpace
    texture.flipY = false
  })

  const userData: {
    init?: boolean
    offset?: number[]
  } = gltf.userData

  if (userData.init !== true) {
    userData.init = true
    Object.values(gltf.meshes).forEach(mesh => {
      mesh.receiveShadow = true
      mesh.castShadow = true
    })
    materials.forEach(material => {
      material.emissiveMap = emissive
    })
  }

  if (userData.offset == null) {
    const { min, max } = new Box3().setFromObject(gltf.scene)
    userData.offset = [-(max.x + min.x) / 2, -min.y - 12, -(max.z + min.z) / 2]
  }

  const mixer = useMemo(() => new AnimationMixer(gltf.scene), [gltf.scene])
  useEffect(() => {
    mixer.clipAction(gltf.animations[0]).play()
    return () => {
      mixer.stopAllAction()
    }
  }, [gltf.animations, mixer])

  useFrame((state, delta) => {
    mixer.update(delta)
  })

  const lightsRef = useRef<Light[]>([])
  const getRef = useCallback((light: Light) => {
    const lights = lightsRef.current
    lights.push(light)
    return () => {
      lights.splice(lights.indexOf(light), 1)
    }
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      setLightIntensity: (value: number) => {
        for (const material of materials) {
          material.emissive.setScalar(value * 0.5)
        }
        for (const light of lightsRef.current) {
          light.intensity = value * 0.1
        }
      }
    }),
    [materials]
  )

  return (
    <group {...props}>
      <primitive object={gltf.scene} position={userData.offset} />
      <pointLight
        ref={getRef}
        position={[95, 115, 29]}
        color='red'
        intensity={0.1}
      />
      <pointLight
        ref={getRef}
        position={[64, 85, 184]}
        color='orange'
        intensity={0.1}
      />
      <pointLight
        ref={getRef}
        position={[196, 85, 209]}
        color='orange'
        intensity={0.1}
      />
      <pointLight
        ref={getRef}
        position={[196, 75, 43]}
        color='orange'
        intensity={0.1}
      />
      <pointLight
        ref={getRef}
        position={[168, 72, -166]}
        color='orange'
        intensity={0.1}
      />
      <rectAreaLight
        ref={getRef}
        position={[-130, 46, 75]}
        rotation-y={Math.PI / 2}
        width={1.4}
        height={0.4}
        color='yellow'
        intensity={0.1}
      />
      <rectAreaLight
        ref={getRef}
        position={[-68, 43, 145]}
        rotation-y={Math.PI}
        width={0.8}
        height={0.7}
        color='yellow'
        intensity={0.1}
      />
      <rectAreaLight
        ref={getRef}
        position={[-52, 43, -77]}
        rotation-y={Math.PI / 4}
        width={0.8}
        height={0.7}
        color='yellow'
        intensity={0.1}
      />
    </group>
  )
}
