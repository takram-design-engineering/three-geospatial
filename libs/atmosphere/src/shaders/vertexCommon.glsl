// TODO: Interpolate the view height.
vec3 getHeightAdjustment(
  float height,
  vec3 ellipsoidRadii,
  vec3 ellipsoidSurface
) {
  float surfaceRadius = length(ellipsoidSurface) * METER_TO_UNIT_LENGTH;
  float offset = surfaceRadius - u_bottom_radius;
  return normalize(ellipsoidSurface) * offset;
}
