uniform vec2 resolution;
uniform int frame;

// Atmospheric parameters
uniform float bottomRadius;
uniform mat4 ellipsoidMatrix;
uniform mat4 inverseEllipsoidMatrix;
uniform vec3 sunDirection;

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

// Cloud layers
uniform vec4 minLayerHeights;
uniform vec4 maxLayerHeights;
uniform vec4 extinctionCoeffs;
uniform vec4 detailAmounts;
uniform vec4 weatherExponents;
uniform vec4 coverageFilterWidths;
uniform float minHeight;
uniform float maxHeight;
