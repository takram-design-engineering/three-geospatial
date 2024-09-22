uniform mat4 projection_matrix_inverse;
uniform mat4 view_matrix_inverse;

layout(location = 0) in vec4 position;
out vec3 view_ray;

void main() {
  gl_Position = position;
  vec4 view_position = projection_matrix_inverse * gl_Position;
  vec4 world_direction = view_matrix_inverse * vec4(view_position.xyz, 0.0);
  view_ray = world_direction.xyz;
}
