import * as THREE from "three";

/** Soft sky shell just outside the earth. */
export const ATMOSPHERE_SCALE = 1.028;
export const SCENE_BG = 0xe7eef6;

const EARTH_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D map;
uniform vec3 lightDir;

varying vec3 vNormal;
varying vec3 vWorld;
varying vec2 vUv;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(lightDir);
  vec3 albedo = texture2D(map, vUv).rgb;
  albedo = pow(albedo, vec3(0.96));

  float ndl = dot(n, l);
  float wrap = clamp(ndl * 0.58 + 0.46, 0.38, 1.0);
  vec3 h = normalize(l + v);
  float water = smoothstep(0.02, 0.14, albedo.b - max(albedo.r, albedo.g) * 0.55);
  float spec = pow(max(dot(n, h), 0.0), mix(36.0, 72.0, water));
  spec *= mix(0.035, 0.22, water) * step(0.0, ndl);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.4);

  vec3 col = albedo * wrap;
  col += vec3(0.85, 0.92, 1.0) * spec;
  col += vec3(0.42, 0.64, 0.95) * fres * mix(0.1, 0.22, water);
  col += albedo * 0.04;
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;

  gl_FragColor = vec4(col, 1.0);
}
`;

const ATM_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const ATM_FRAG = /* glsl */ `
uniform float intensity;
varying vec3 vNormal;
varying vec3 vWorld;

void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - abs(dot(n, v)), 3.6);
  float alpha = fres * 0.7 * intensity;
  gl_FragColor = vec4(vec3(0.42, 0.66, 0.98), alpha);
}
`;

export function createEarthMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      lightDir: { value: new THREE.Vector3(-0.42, 0.48, 0.76).normalize() },
    },
    vertexShader: EARTH_VERT,
    fragmentShader: EARTH_FRAG,
    toneMapped: false,
  });
}

export function createAtmosphereMesh(radius: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: { intensity: { value: 1 } },
    vertexShader: ATM_VERT,
    fragmentShader: ATM_FRAG,
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * ATMOSPHERE_SCALE, 80, 48), mat);
  mesh.renderOrder = 1;
  mesh.raycast = () => {};
  return mesh;
}

export function studioLightDir(
  camera: THREE.Camera,
  out: THREE.Vector3,
  right: THREE.Vector3,
  camUp: THREE.Vector3,
): THREE.Vector3 {
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  out.setFromMatrixColumn(camera.matrixWorld, 2);
  return out.addScaledVector(camUp, 0.42).addScaledVector(right, -0.38).normalize();
}
