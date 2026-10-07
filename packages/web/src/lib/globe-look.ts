import * as THREE from "three";

/** Tight silver shell just outside the earth, for a paperweight limb. */
export const ATMOSPHERE_SCALE = 1.016;

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
  vec3 c = texture2D(map, vUv).rgb;
  vec3 cSoft = texture2D(map, vUv, 1.4).rgb;

  float luma = dot(cSoft, vec3(0.2126, 0.7152, 0.0722));
  float blue = c.b - max(c.r, c.g) * 0.62;
  float water = smoothstep(0.04, 0.15, blue);
  water *= 1.0 - smoothstep(0.76, 0.92, luma);
  float ice = smoothstep(0.76, 0.93, luma) * (1.0 - water);

  float landL = smoothstep(0.14, 0.56, luma);
  vec3 land = mix(vec3(0.12), vec3(0.52), landL);
  vec3 ocean = vec3(0.016);
  vec3 iceC = vec3(0.84);
  vec3 albedo = mix(land, ocean, water);
  albedo = mix(albedo, iceC, ice);

  float coast = 1.0 - smoothstep(0.0, 0.18, abs(water - 0.5) * 2.0);
  albedo = mix(albedo, vec3(0.36), coast * 0.16 * (1.0 - ice));

  float ndl = dot(n, l);
  float wrap = clamp(ndl * 0.62 + 0.38, 0.22, 1.0);
  vec3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), mix(22.0, 110.0, water));
  spec *= mix(0.04, 0.18, water) * step(0.0, ndl);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.6);

  vec3 col = albedo * wrap;
  col += vec3(spec);
  col += vec3(0.82) * fres * 0.16;
  col += albedo * 0.07;
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
  float fres = pow(1.0 - abs(dot(n, v)), 6.2);
  float alpha = fres * 0.5 * intensity;
  gl_FragColor = vec4(vec3(0.92), alpha);
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
    blending: THREE.AdditiveBlending,
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
  return out.addScaledVector(camUp, 0.38).addScaledVector(right, -0.46).normalize();
}
