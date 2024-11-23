import { DataTexture, Vector2, Vector3 } from 'three'

import { sampleTexture } from './sampleTexture'

describe('sampleTexture', () => {
  // prettier-ignore
  const data = new Float32Array([
    0, 0, 0, 0, // (0, 0)
    1, 0, 0, 0, // (1, 0)
    0, 1, 0, 0, // (0, 1)
    0, 0, 1, 0, // (1, 1)
  ])
  const texture = new DataTexture(data, 2, 2)

  test('sample', () => {
    // prettier-ignore
    expect(
      sampleTexture(texture, new Vector2(0, 0), new Vector3())
    ).toMatchObject(new Vector3(0, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(1, 0), new Vector3())
    ).toMatchObject(new Vector3(1, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(0, 1), new Vector3())
    ).toMatchObject(new Vector3(0, 1, 0))
    expect(
      sampleTexture(texture, new Vector2(1, 1), new Vector3())
    ).toMatchObject(new Vector3(0, 0, 1))
  })

  test('interpolate', () => {
    expect(
      sampleTexture(texture, new Vector2(0.5, 0), new Vector3())
    ).toMatchObject(new Vector3(0.5, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(0, 0.5), new Vector3())
    ).toMatchObject(new Vector3(0, 0.5, 0))
    expect(
      sampleTexture(texture, new Vector2(0.5, 0.5), new Vector3())
    ).toMatchObject(new Vector3(0.25, 0.25, 0.25))
  })

  test('clamp border', () => {
    expect(
      sampleTexture(texture, new Vector2(-1, 0), new Vector3())
    ).toMatchObject(new Vector3(0, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(2, 0), new Vector3())
    ).toMatchObject(new Vector3(1, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(0, -1), new Vector3())
    ).toMatchObject(new Vector3(0, 0, 0))
    expect(
      sampleTexture(texture, new Vector2(0, 2), new Vector3())
    ).toMatchObject(new Vector3(0, 1, 0))
  })
})
