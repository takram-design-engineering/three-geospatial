import { useState, type FC } from 'react'
import { type Object3D } from 'three'

export const SunLight: FC = () => {
  const [target, setTarget] = useState<Object3D | null>(null)
  return (
    <>
      <object3D ref={setTarget} position={[0, 0, 0]} />
      <directionalLight
        position={[500, 1000, 1000]}
        intensity={1}
        castShadow
        shadow-mapSize={[8192, 8192]}
        target={target ?? undefined}
      >
        <orthographicCamera
          attach='shadow-camera'
          args={[-2500, 2500, 2500, -2500, 1, 5000]}
        />
      </directionalLight>
    </>
  )
}
