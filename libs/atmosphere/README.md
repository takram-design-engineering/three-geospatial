# atmosphere

# API

**Three.js**

- [`AtmosphereMaterialBase`](#atmospherematerialbase)
- [`SkyMaterial`](#skymaterial)
- [`SkyRadianceMaterial`](#skyradiancematerial)
- [`StarsGeometry`](#starsgeometry)
- [`StarsMaterial`](#starsmaterial)
- [`AerialPerspectiveEffect`](#aerialperspectiveeffect)

**R3F**

- [`Sky`](#sky)
- [`SkyRadiance`](#skyradiance)
- [`Stars`](#stars)
- [`AerialPerspective`](#aerialperspective)

**Functions**

- [`getSunDirectionECEF`](#getsundirectionecef)
- [`getMoonDirectionECEF`](#getmoondirectionecef)
- [`getECIToECEFRotationMatrix`](#getecitoecefrotationmatrix)
- [`computeSkyTransmittance`](#computeskytransmittance)
- [`computeSunLightColor`](#computesunlightcolor)

## AtmosphereMaterialBase

Base class of [`SkyMaterial`](#skymaterial), [`SkyRadianceMaterial`](#skyradiancematerial) and [`StarsMaterial`](#starsmaterial).

#### .irradianceTexture, .scatteringTexture, .transmittanceTexture

```ts
irradianceTexture = null : Texture | null
scatteringTexture = null : Texture | null
transmittanceTexture = null : Texture | null
```

#### .useHalfFloat

```ts
useHalfFloat = false : boolean
```

#### .ellipsoid

```ts
ellipsoid = Ellipsoid.WGS84 : Ellipsoid
```

#### .osculateEllipsoid

```ts
osculateEllipsoid = true : boolean
```

#### .photometric

```ts
photometric = true : boolean
```

#### .sunDirection

```ts
sunDirection = new Vector() : Vector3
```

#### .sunAngularRadius

```ts
sunAngularRadius = 0.004675 : number
```

## SkyMaterial

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

#### .sun

```ts
sun = true : boolean
```

#### .moon

```ts
moon = true : boolean
```

#### .moonDirection

```ts
moonDirection = new Vector3() : Vector3
```

#### .moonAngularRadius

```ts
moonAngularRadius = 0.0045 : number
```

#### .lunarRadianceScale

```ts
lunarRadianceScale = 1 : number
```

## SkyRadianceMaterial

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

## StarsGeometry

Extends `BufferGeometry`.

## StarsMaterial

Extends [`AtmosphereMaterialBase`](#atmospherematerialbase).

#### .pointSize

```ts
pointSize = 1 : number
```

#### .magnitudeRange

```ts
magnitudeRange new Vector2(-2, 8) : Vector2
```

#### .radianceScale

```ts
radianceScale = 1 : number
```

#### .background

```ts
background = true : boolean
```

## AerialPerspectiveEffect

Extends [`postprocessing`](https://github.com/pmndrs/postprocessing)’s `Effect`.

#### .normalBuffer

```ts
normalBuffer = null : Texture | null
```

#### .reconstructNormal

```ts
reconstructNormal = false : boolean
```

#### .irradianceTexture, .scatteringTexture, .transmittanceTexture

```ts
irradianceTexture = null : Texture | null
scatteringTexture = null : Texture | null
transmittanceTexture = null : Texture | null
```

#### .useHalfFloat

```ts
useHalfFloat = false : boolean
```

#### .ellipsoid

```ts
ellipsoid = Ellipsoid.WGS84 : Ellipsoid
```

#### .osculateEllipsoid

```ts
osculateEllipsoid = true : boolean
```

#### .morphToSphere

```ts
morphToSphere = true : boolean
```

#### .ellipsoidInterpolationRange

```ts
ellipsoidInterpolationRange = new Vector2(2e5, 6e5) : Vector2
```

#### .photometric

```ts
photometric = true : boolean
```

#### .sunDirection

```ts
sunDirection = new Vector3() : Vector3
```

#### .sunIrradiance

```ts
sunIrradiance = true : boolean
```

#### .skyIrradiance

```ts
skyIrradiance = true : boolean
```

#### .transmittance

```ts
transmittance = true : boolean
```

#### .inscatter

```ts
inscatter = true : boolean
```

#### .albedoScale

```ts
albedoScale = 1 : number
```

## getSunDirectionECEF

```ts
function getSunDirectionECEF(
  date: Date | number,
  result = new Vector3()
): Vector3
```

## getMoonDirectionECEF

```ts
getMoonDirectionECEF(
  date: Date | number,
  result = new Vector3()
) => Vector3
```

## getECIToECEFRotationMatrix

```ts
getECIToECEFRotationMatrix(
  date: Date | number,
  result = new Matrix4()
) => Matrix4
```

## computeSkyTransmittance

```ts
computeSkyTransmittance(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  worldDirection: Vector3,
  result = new Vector3() : Vector3,
  options = {
    ellipsoid = Ellipsoid.WGS84 : Ellipsoid,
    osculateEllipsoid = true : boolean
  }
) => Vector3
```

## computeSunLightColor

```ts
computeSunLightColor(
  transmittanceTexture: DataTexture,
  worldPosition: Vector3,
  sunDirection: Vector3,
  result = new Color() : Color,
  options = {
    ellipsoid = Ellipsoid.WGS84 : Ellipsoid,
    osculateEllipsoid = true : boolean,
    photometric = true : boolean,
  }
): Color
```

# References

- [Precomputed Atmospheric Scattering](https://inria.hal.science/inria-00288758/en) ([Github](https://github.com/ebruneton/precomputed_atmospheric_scattering)) by Eric Bruneton and Fabrice Neyret
- [The Bright Star Catalogue, 5th Revised Ed.](http://tdc-www.harvard.edu/catalogs/bsc5.html) by Hoffleit D. and Warren Jr W.H.
- [Physically Based Rendering in Filament](https://google.github.io/filament/Filament.html) by Google
