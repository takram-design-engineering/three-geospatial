// TODO: Interpolate the view height.
vec3 getHeightAdjustment(
  float height,
  vec3 ellipsoidRadii,
  vec3 ellipsoidSurface
) {
  float surfaceRadius = length(ellipsoidSurface);
  float offset = surfaceRadius - ATMOSPHERE_BOTTOM_RADIUS;
  return normalize(ellipsoidSurface) * offset;
}
