uniform vec2 resolution;
uniform int frame;
uniform sampler3D stbnTexture;

// Atmosphere
uniform float bottomRadius;
uniform mat4 ellipsoidMatrix;
uniform mat4 inverseEllipsoidMatrix;
uniform vec3 sunDirection;

// Scattering
uniform float scatteringCoefficient;
uniform float absorptionCoefficient;
uniform float minDensity;
uniform float minExtinction;
uniform float minTransmittance;

// Shape and weather
uniform sampler2D localWeatherTexture;
uniform vec2 localWeatherFrequency;
uniform vec2 localWeatherOffset;
uniform float coverage;
uniform sampler3D shapeTexture;
uniform vec3 shapeFrequency;
uniform vec3 shapeOffset;
uniform sampler3D shapeDetailTexture;
uniform vec3 shapeDetailFrequency;
uniform vec3 shapeDetailOffset;
uniform sampler2D turbulenceTexture;
uniform vec2 turbulenceFrequency;
uniform float turbulenceDisplacement;

// Cloud layers
uniform vec4 minLayerHeights;
uniform vec4 maxLayerHeights;
uniform vec4 densityScales;
uniform vec4 shapeAmounts;
uniform vec4 detailAmounts;
uniform vec4 weatherExponents;
uniform vec4 shapeAlteringBiases;
uniform vec4 coverageFilterWidths;
uniform float minHeight;
uniform float maxHeight;
uniform float shadowTopHeight;
uniform float shadowBottomHeight;
