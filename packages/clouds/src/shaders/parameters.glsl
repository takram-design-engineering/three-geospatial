uniform vec2 resolution;
uniform int frame;
uniform float time;

// Atmospheric parameters
uniform float bottomRadius; // TODO
uniform vec3 sunDirection;
uniform vec3 ellipsoidCenter;

// Shape and weather
uniform sampler2D localWeatherTexture;
uniform vec2 localWeatherFrequency;
uniform float coverage;
uniform sampler3D shapeTexture;
uniform float shapeFrequency;
uniform sampler3D shapeDetailTexture;
uniform float shapeDetailFrequency;

// Cloud layers
uniform vec4 minLayerHeights;
uniform vec4 maxLayerHeights;
uniform vec4 extinctionCoeffs;
uniform vec4 detailAmounts;
uniform vec4 weatherExponents;
uniform vec4 coverageFilterWidths;
uniform float minHeight;
uniform float maxHeight;
